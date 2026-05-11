import { useState, useCallback, useRef } from "react";

export type LiveStatus = "idle" | "connecting" | "active" | "stopped" | "error";

export interface LiveFrame {
  frameBase64: string;
  wallTime: string;
}

export interface LiveAnalysis {
  detected: boolean;
  confidence: string;
  frameBase64: string;
  wallTime: string;
}

export interface LiveFireAlert {
  frameBase64: string;
  wallTime: string;
  confidence: string;
}

export function useLiveStream() {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [latestFrame, setLatestFrame] = useState<LiveFrame | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<LiveAnalysis | null>(null);
  const [fireAlert, setFireAlert] = useState<LiveFireAlert | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (rtspUrl: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setStatus("connecting");
    setLatestFrame(null);
    setLatestAnalysis(null);
    setFireAlert(null);
    setError(null);
    setFrameCount(0);

    try {
      const encodedUrl = encodeURIComponent(rtspUrl);
      const response = await fetch(`/api/fire-detection/live-stream?url=${encodedUrl}`, {
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((body as { error: string }).error || response.statusText);
      }

      if (!response.body) throw new Error("No response body");

      setStatus("active");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              frameBase64?: string;
              wallTime?: string;
              detected?: boolean;
              confidence?: string;
              message?: string;
            };

            switch (event.type) {
              case "connected":
                setStatus("active");
                break;
              case "frame":
                setLatestFrame({ frameBase64: event.frameBase64!, wallTime: event.wallTime! });
                setFrameCount((n) => n + 1);
                break;
              case "analysis":
                setLatestAnalysis({
                  detected: event.detected!,
                  confidence: event.confidence!,
                  frameBase64: event.frameBase64!,
                  wallTime: event.wallTime!,
                });
                break;
              case "fire":
                setFireAlert({
                  frameBase64: event.frameBase64!,
                  wallTime: event.wallTime!,
                  confidence: event.confidence!,
                });
                break;
              case "error":
                setError(event.message ?? "Unknown error");
                break;
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setStatus("stopped");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setStatus("stopped");
        return;
      }
      setError(err instanceof Error ? err.message : "Connection failed");
      setStatus("error");
    }
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("stopped");
  }, []);

  const dismissAlert = useCallback(() => {
    setFireAlert(null);
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStatus("idle");
    setLatestFrame(null);
    setLatestAnalysis(null);
    setFireAlert(null);
    setError(null);
    setFrameCount(0);
  }, []);

  return { status, latestFrame, latestAnalysis, fireAlert, error, frameCount, start, stop, dismissAlert, reset };
}
