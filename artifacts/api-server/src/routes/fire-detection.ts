import { Router } from "express";
import multer from "multer";
import { spawn } from "child_process";
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

async function extractFrame(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-ss", String(timestamp),
    "-i", videoPath,
    "-vframes", "1",
    "-vf", "scale=640:-1",
    "-q:v", "3",
    "-y", outputPath,
  ]);
}

/** Capture a single frame from an RTSP stream into a Buffer */
function captureRTSPFrame(rtspUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn("ffmpeg", [
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-frames:v", "1",
      "-vf", "scale=640:-1",
      "-q:v", "3",
      "-f", "image2",
      "pipe:1",
    ], { stdio: ["ignore", "pipe", "ignore"] });

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    proc.on("close", (code) => {
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code ?? "unknown"} — check RTSP URL`));
      }
    });

    proc.on("error", reject);

    // Hard timeout: give ffmpeg 15s to deliver a frame
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Frame capture timed out (15s). Check that the RTSP URL is reachable."));
    }, 15000);

    proc.on("close", () => clearTimeout(timer));
  });
}

/** Analyze a batch of frames from disk paths */
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
    parts.push({ text: `Frame ${i} (at ${formatTimestamp(framePaths[i].timestamp)}):` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: frameData.toString("base64") } });
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json", maxOutputTokens: 8192 },
      });
      const parsed = JSON.parse(response.text ?? "{}") as {
        fireDetected: boolean;
        firstFireFrameIndex: number | null;
        confidence: string;
      };
      if (parsed.fireDetected && parsed.firstFireFrameIndex !== null) {
        return { detected: true, frameIndex: parsed.firstFireFrameIndex, confidence: parsed.confidence ?? "medium" };
      }
      return { detected: false, frameIndex: -1, confidence: parsed.confidence ?? "medium" };
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err)) {
        await new Promise((r) => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 30000)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/** Analyze a single raw JPEG buffer for fire */
async function analyzeSingleFrameBuffer(
  frameBuffer: Buffer,
  wallTimeLabel: string
): Promise<{ detected: boolean; confidence: string }> {
  const b64 = frameBuffer.toString("base64");

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            {
              text: `You are a fire safety AI monitoring a live chemical plant CCTV feed. The current wall-clock time is ${wallTimeLabel}.

Examine this single surveillance frame carefully. Determine whether visible fire is present.

Fire indicators:
- Active flames (orange, yellow, red, white-hot)
- Visible combustion or burning at equipment, pipes, tanks, or structures
- NOT: normal lighting, hot surfaces without flames, steam, or glare

Respond with JSON only:
{
  "fireDetected": true or false,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence>"
}`,
            },
            { inlineData: { mimeType: "image/jpeg", data: b64 } },
          ],
        }],
        config: { responseMimeType: "application/json", maxOutputTokens: 512 },
      });

      const parsed = JSON.parse(response.text ?? "{}") as {
        fireDetected: boolean;
        confidence: string;
      };
      return { detected: !!parsed.fireDetected, confidence: parsed.confidence ?? "medium" };
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err)) {
        await new Promise((r) => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 20000)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ─── GET /fire-detection/history ────────────────────────────────────────────
router.get("/fire-detection/history", async (req, res) => {
  try {
    const records = await db.select().from(fireDetectionsTable).orderBy(fireDetectionsTable.createdAt);
    res.json(records.reverse());
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch history");
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ─── DELETE /fire-detection/history/:id ─────────────────────────────────────
router.delete("/fire-detection/history/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const deleted = await db.delete(fireDetectionsTable).where(eq(fireDetectionsTable.id, id)).returning();
    if (deleted.length === 0) { res.status(404).json({ error: "Record not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "Failed to delete history record");
    res.status(500).json({ error: "Failed to delete record" });
  }
});

// ─── GET /fire-detection/live-stream ────────────────────────────────────────
router.get("/fire-detection/live-stream", async (req, res) => {
  const rtspUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!rtspUrl) {
    res.status(400).json({ error: "Query param 'url' (RTSP stream URL) is required." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (data: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let running = true;
  req.on("close", () => { running = false; });

  sendEvent({ type: "connected", message: "Live monitoring active. Capturing frames…" });

  while (running) {
    const iterStart = Date.now();

    try {
      // 1. Capture frame
      const frameBuffer = await captureRTSPFrame(rtspUrl);
      if (!running) break;

      const frameBase64 = `data:image/jpeg;base64,${frameBuffer.toString("base64")}`;
      const wallTime = new Date().toISOString();
      const wallTimeLabel = new Date().toLocaleTimeString();

      sendEvent({ type: "frame", frameBase64, wallTime });

      // 2. Analyze frame
      const result = await analyzeSingleFrameBuffer(frameBuffer, wallTimeLabel);
      if (!running) break;

      sendEvent({
        type: "analysis",
        detected: result.detected,
        confidence: result.confidence,
        frameBase64,
        wallTime,
      });

      // 3. If fire — persist to history
      if (result.detected) {
        try {
          await db.insert(fireDetectionsTable).values({
            videoName: `LIVE: ${rtspUrl}`,
            detected: true,
            detectedAtSeconds: null,
            timestampFormatted: wallTimeLabel,
            confidence: result.confidence,
            thumbnailBase64: frameBase64,
          });
        } catch (dbErr) {
          req.log?.error({ dbErr }, "Failed to save live detection to history");
        }

        sendEvent({ type: "fire", frameBase64, wallTime, confidence: result.confidence });
      }
    } catch (err) {
      if (!running) break;
      const message = err instanceof Error ? err.message : "Unknown error";
      req.log?.error({ err }, "Live stream frame error");
      sendEvent({ type: "error", message });
    }

    // Wait out the remainder of the 2-second interval
    const elapsed = Date.now() - iterStart;
    const wait = Math.max(0, 2000 - elapsed);
    if (running && wait > 0) {
      await new Promise<void>((r) => {
        const t = setTimeout(r, wait);
        req.on("close", () => { clearTimeout(t); r(); });
      });
    }
  }

  if (!res.writableEnded) res.end();
});

// ─── POST /fire-detection/analyze ───────────────────────────────────────────
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
      for (let t = 0; t < duration; t += sampleInterval) timestamps.push(t);

      const totalFrames = timestamps.length;
      sendEvent({
        type: "progress",
        message: `Extracting ${totalFrames} frames from ${formatTimestamp(duration)} video…`,
        current: 5, total: 100,
      });

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
            } catch { /* skip */ }
          })
        );
        sendEvent({
          type: "progress",
          message: `Extracted ${Math.min(i + extractBatchSize, totalFrames)} / ${totalFrames} frames…`,
          current: Math.min(Math.round(5 + ((i + extractBatchSize) / timestamps.length) * 30), 35),
          total: 100,
        });
      }

      framePaths.sort((a, b) => a.timestamp - b.timestamp);

      if (framePaths.length === 0) {
        sendEvent({ type: "error", message: "Failed to extract frames from the video." });
        res.end();
        return;
      }

      sendEvent({ type: "progress", message: `Analyzing ${framePaths.length} frames with Gemini AI…`, current: 40, total: 100 });

      const chunkSize = 8;
      let fireDetectedAt: { timestamp: number; confidence: string; framePath: string } | null = null;
      let analyzedChunks = 0;
      const totalChunks = Math.ceil(framePaths.length / chunkSize);

      for (let i = 0; i < framePaths.length; i += chunkSize) {
        const chunk = framePaths.slice(i, i + chunkSize);
        analyzedChunks++;
        sendEvent({
          type: "progress",
          message: `Scanning ${formatTimestamp(chunk[0].timestamp)} – ${formatTimestamp(chunk[chunk.length - 1].timestamp)} (chunk ${analyzedChunks}/${totalChunks})…`,
          current: Math.round(40 + (analyzedChunks / totalChunks) * 55),
          total: 100,
        });

        const result = await analyzeFramesForFire(chunk);
        if (result?.detected && result.frameIndex >= 0 && result.frameIndex < chunk.length) {
          const detectedFrame = chunk[result.frameIndex];
          fireDetectedAt = { timestamp: detectedFrame.timestamp, confidence: result.confidence, framePath: detectedFrame.path };
          break;
        }
      }

      sendEvent({ type: "progress", message: "Analysis complete.", current: 100, total: 100 });

      if (fireDetectedAt) {
        let thumbnailBase64: string | null = null;
        try {
          const thumbData = await fs.readFile(fireDetectedAt.framePath);
          thumbnailBase64 = `data:image/jpeg;base64,${thumbData.toString("base64")}`;
        } catch { /* best-effort */ }

        try {
          await db.insert(fireDetectionsTable).values({
            videoName,
            detected: true,
            detectedAtSeconds: fireDetectedAt.timestamp,
            timestampFormatted: formatTimestamp(fireDetectedAt.timestamp),
            confidence: fireDetectedAt.confidence,
            thumbnailBase64,
          });
        } catch (err) { req.log?.error({ err }, "Failed to save detection to history"); }

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
        try {
          await db.insert(fireDetectionsTable).values({ videoName, detected: false, detectedAtSeconds: null, timestampFormatted: null, confidence: null, thumbnailBase64: null });
        } catch (err) { req.log?.error({ err }, "Failed to save no-detection to history"); }

        sendEvent({ type: "result", detected: false, message: "No fire detected in the video." });
      }

      res.end();
    } catch (err) {
      req.log?.error({ err }, "Fire detection analysis failed");
      sendEvent({ type: "error", message: err instanceof Error ? err.message : "An unexpected error occurred." });
      res.end();
    } finally {
      try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      if (file?.path) { try { await fs.unlink(file.path); } catch { /* ignore */ } }
    }
  }
);

export default router;
