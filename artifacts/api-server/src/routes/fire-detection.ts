import { Router } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { ai } from "@workspace/integrations-gemini-ai";
import { isRateLimitError } from "@workspace/integrations-gemini-ai/batch";
import { db, fireDetectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const execFileAsync = promisify(execFile);

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

async function extractFrame(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-ss", String(timestamp),
    "-i", videoPath,
    "-vframes", "1",
    "-vf", "scale=640:-1",
    "-q:v", "3",
    "-y", outputPath,
  ]);
}

async function analyzeFramesForFire(
  framePaths: { path: string; timestamp: number }[]
): Promise<{ detected: boolean; frameIndex: number; confidence: string } | null> {
  const parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] = [];

  parts.push({
    text: `You are a fire detection expert analyzing frames from a chemical plant surveillance video.

For each of the ${framePaths.length} frames shown below (labeled Frame 0 through Frame ${framePaths.length - 1}), determine if there is visible fire present.

Fire characteristics to look for:
- Flames (orange, yellow, red, white hot)
- Visible combustion with dynamic flickering patterns
- Fire at a chemical plant (pipes, reactors, storage tanks, processing equipment)
- NOT: normal industrial lighting, reflections, or hot glowing metal without flames

Respond with JSON only, in this exact format:
{
  "fireDetected": true or false,
  "firstFireFrameIndex": <index 0-${framePaths.length - 1} of earliest frame with fire, or null if none>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<brief explanation>"
}`,
  });

  for (let i = 0; i < framePaths.length; i++) {
    const frameData = await fs.readFile(framePaths[i].path);
    const b64 = frameData.toString("base64");
    parts.push({ text: `Frame ${i} (at ${formatTimestamp(framePaths[i].timestamp)}):` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json", maxOutputTokens: 8192 },
      });

      const text = response.text ?? "{}";
      const parsed = JSON.parse(text) as {
        fireDetected: boolean;
        firstFireFrameIndex: number | null;
        confidence: string;
        reasoning: string;
      };

      if (parsed.fireDetected && parsed.firstFireFrameIndex !== null) {
        return { detected: true, frameIndex: parsed.firstFireFrameIndex, confidence: parsed.confidence ?? "medium" };
      }
      return { detected: false, frameIndex: -1, confidence: parsed.confidence ?? "medium" };
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err)) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 30000);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// GET /fire-detection/history
router.get("/fire-detection/history", async (req, res) => {
  try {
    const records = await db
      .select()
      .from(fireDetectionsTable)
      .orderBy(fireDetectionsTable.createdAt);
    res.json(records.reverse());
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch history");
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// DELETE /fire-detection/history/:id
router.delete("/fire-detection/history/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const deleted = await db
      .delete(fireDetectionsTable)
      .where(eq(fireDetectionsTable.id, id))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "Failed to delete history record");
    res.status(500).json({ error: "Failed to delete record" });
  }
});

// POST /fire-detection/analyze
router.post(
  "/fire-detection/analyze",
  upload.single("video"),
  async (req, res) => {
    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const file = req.file;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fire-det-"));

    try {
      if (!file) {
        sendEvent({ type: "error", message: "No video file provided" });
        res.end();
        return;
      }

      sendEvent({ type: "progress", message: "Reading video metadata…", current: 0, total: 100 });

      const videoPath = file.path;
      const videoName = (file.originalname as string) || "unknown.mp4";
      const duration = await getVideoDuration(videoPath);

      if (duration <= 0) {
        sendEvent({ type: "error", message: "Could not read video duration. Ensure the file is a valid video." });
        res.end();
        return;
      }

      const sampleInterval = Math.max(1, Math.ceil(duration / 120));
      const timestamps: number[] = [];
      for (let t = 0; t < duration; t += sampleInterval) {
        timestamps.push(t);
      }

      const totalFrames = timestamps.length;
      sendEvent({
        type: "progress",
        message: `Extracting ${totalFrames} frames from ${formatTimestamp(duration)} video…`,
        current: 5,
        total: 100,
      });

      // Extract frames in parallel batches
      const framePaths: { path: string; timestamp: number }[] = [];
      const extractBatchSize = 10;
      for (let i = 0; i < timestamps.length; i += extractBatchSize) {
        const batch = timestamps.slice(i, i + extractBatchSize);
        await Promise.all(
          batch.map(async (ts, batchIdx) => {
            const idx = i + batchIdx;
            const framePath = path.join(tempDir, `frame_${String(idx).padStart(5, "0")}.jpg`);
            try {
              await extractFrame(videoPath, ts, framePath);
              framePaths.push({ path: framePath, timestamp: ts });
            } catch {
              // skip failed frames
            }
          })
        );
        const extractProgress = Math.round(5 + ((i + extractBatchSize) / timestamps.length) * 30);
        sendEvent({
          type: "progress",
          message: `Extracted ${Math.min(i + extractBatchSize, totalFrames)} / ${totalFrames} frames…`,
          current: Math.min(extractProgress, 35),
          total: 100,
        });
      }

      framePaths.sort((a, b) => a.timestamp - b.timestamp);

      if (framePaths.length === 0) {
        sendEvent({ type: "error", message: "Failed to extract frames from the video." });
        res.end();
        return;
      }

      sendEvent({
        type: "progress",
        message: `Analyzing ${framePaths.length} frames with Gemini AI…`,
        current: 40,
        total: 100,
      });

      const chunkSize = 8;
      let fireDetectedAt: { timestamp: number; confidence: string; framePath: string } | null = null;
      let analyzedChunks = 0;
      const totalChunks = Math.ceil(framePaths.length / chunkSize);

      for (let i = 0; i < framePaths.length; i += chunkSize) {
        const chunk = framePaths.slice(i, i + chunkSize);
        analyzedChunks++;

        const chunkStartTime = chunk[0].timestamp;
        const chunkEndTime = chunk[chunk.length - 1].timestamp;

        sendEvent({
          type: "progress",
          message: `Scanning ${formatTimestamp(chunkStartTime)} – ${formatTimestamp(chunkEndTime)} (chunk ${analyzedChunks}/${totalChunks})…`,
          current: Math.round(40 + (analyzedChunks / totalChunks) * 55),
          total: 100,
        });

        const result = await analyzeFramesForFire(chunk);

        if (result?.detected && result.frameIndex >= 0 && result.frameIndex < chunk.length) {
          const detectedFrame = chunk[result.frameIndex];
          fireDetectedAt = {
            timestamp: detectedFrame.timestamp,
            confidence: result.confidence,
            framePath: detectedFrame.path,
          };
          break;
        }
      }

      sendEvent({ type: "progress", message: "Analysis complete.", current: 100, total: 100 });

      if (fireDetectedAt) {
        // Read thumbnail as base64
        let thumbnailBase64: string | null = null;
        try {
          const thumbData = await fs.readFile(fireDetectedAt.framePath);
          thumbnailBase64 = `data:image/jpeg;base64,${thumbData.toString("base64")}`;
        } catch {
          // thumbnail is best-effort
        }

        // Persist to history
        try {
          await db.insert(fireDetectionsTable).values({
            videoName,
            detected: true,
            detectedAtSeconds: fireDetectedAt.timestamp,
            timestampFormatted: formatTimestamp(fireDetectedAt.timestamp),
            confidence: fireDetectedAt.confidence,
            thumbnailBase64,
          });
        } catch (err) {
          req.log?.error({ err }, "Failed to save detection to history");
        }

        sendEvent({
          type: "result",
          detected: true,
          timestamp: fireDetectedAt.timestamp,
          timestampFormatted: formatTimestamp(fireDetectedAt.timestamp),
          confidence: fireDetectedAt.confidence,
          thumbnailBase64,
          message: `Fire first detected at ${formatTimestamp(fireDetectedAt.timestamp)}`,
        });
      } else {
        // Persist no-fire result
        try {
          await db.insert(fireDetectionsTable).values({
            videoName,
            detected: false,
            detectedAtSeconds: null,
            timestampFormatted: null,
            confidence: null,
            thumbnailBase64: null,
          });
        } catch (err) {
          req.log?.error({ err }, "Failed to save no-detection to history");
        }

        sendEvent({
          type: "result",
          detected: false,
          message: "No fire detected in the video.",
        });
      }

      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      req.log?.error({ err }, "Fire detection analysis failed");
      sendEvent({ type: "error", message });
      res.end();
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch { /* ignore */ }
      if (file?.path) {
        try {
          await fs.unlink(file.path);
        } catch { /* ignore */ }
      }
    }
  }
);

export default router;
