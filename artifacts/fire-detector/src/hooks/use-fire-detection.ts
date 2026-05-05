import { useState, useCallback, useRef } from "react";

export type AnalysisStatus = "idle" | "uploading" | "analyzing" | "complete" | "error";

export interface ProgressEvent {
  type: "progress";
  message: string;
  current: number;
  total: number;
}

export interface ResultEvent {
  type: "result";
  detected: boolean;
  timestamp?: number;
  timestampFormatted?: string;
  confidence?: string;
  message: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type AnalysisEvent = ProgressEvent | ResultEvent | ErrorEvent;

export function useFireDetection() {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<ResultEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (file: File) => {
    setStatus("uploading");
    setProgress(null);
    setResult(null);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const formData = new FormData();
    formData.append("video", file);

    try {
      const response = await fetch("/api/fire-detection/analyze", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to start analysis: ${response.statusText}`);
      }

      setStatus("analyzing");

      if (!response.body) throw new Error("No response body");

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
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as AnalysisEvent;

              switch (event.type) {
                case "progress":
                  setProgress(event);
                  break;
                case "result":
                  setResult(event);
                  setStatus("complete");
                  break;
                case "error":
                  setError(event.message);
                  setStatus("error");
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE message", e);
            }
          }
        }
      }
      
      // If stream ended but we didn't get a result or error
      setStatus((prev) => {
        if (prev === "analyzing") return "complete";
        return prev;
      });

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Analysis aborted");
        return;
      }
      setError(err.message || "An unexpected error occurred");
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    progress,
    result,
    error,
    analyze,
    reset,
  };
}
