import React, { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFireDetection } from "@/hooks/use-fire-detection";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useGetFireDetectionHistory, useDeleteFireDetectionRecord, getGetFireDetectionHistoryQueryKey } from "@workspace/api-client-react";
import { FirewatchLogo } from "@/components/FirewatchLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  UploadCloud, FileVideo, AlertTriangle, CheckCircle2, RotateCcw,
  AlertOctagon, Trash2, Clock, Eye, X, Radio, Power, PowerOff,
  Wifi, WifiOff, Activity,
} from "lucide-react";

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatWallTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ─── Thumbnail Modal ───────────────────────────────────────────────────────── */

interface ThumbnailModalProps {
  open: boolean;
  onClose: () => void;
  thumbnailBase64: string;
  label?: string | null;
  videoName?: string;
}

function ThumbnailModal({ open, onClose, thumbnailBase64, label, videoName }: ThumbnailModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/50">
          <DialogTitle className="font-mono uppercase tracking-wider text-xs text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-primary" />
              <span>Fire Detection Frame</span>
            </span>
            {label && <span className="text-primary font-bold text-base">{label}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="relative bg-black">
          <img src={thumbnailBase64} alt="Detected fire frame" className="w-full object-contain max-h-[60vh]" data-testid="thumbnail-image" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
            <p className="text-xs font-mono text-muted-foreground truncate">{videoName}</p>
          </div>
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-mono">Human verification required. Confirm fire presence before escalation.</p>
          <Button variant="outline" size="sm" onClick={onClose} className="font-mono text-xs uppercase tracking-wider">
            <X className="w-3 h-3 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── History Panel ─────────────────────────────────────────────────────────── */

interface HistoryPanelProps {
  onOpenThumbnail: (src: string, label?: string | null, name?: string) => void;
}

function HistoryPanel({ onOpenThumbnail }: HistoryPanelProps) {
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useGetFireDetectionHistory();
  const deleteMutation = useDeleteFireDetectionRecord({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFireDetectionHistoryQueryKey() }),
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Clock className="w-3 h-3" /> Detection History
        </h2>
        {history && history.length > 0 && (
          <span className="text-xs text-muted-foreground font-mono">{history.length} record{history.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground font-mono py-4">Loading history…</p>
      ) : !history || history.length === 0 ? (
        <div className="border border-dashed border-border/40 rounded-lg py-8 text-center">
          <p className="text-xs text-muted-foreground font-mono">No analyses recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="history-list">
          {history.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-3 bg-card/30 border border-border/40 rounded-lg px-4 py-3 hover:bg-card/50 transition-colors"
              data-testid={`history-record-${record.id}`}
            >
              <div className="flex-shrink-0 w-14 h-10 rounded overflow-hidden bg-secondary border border-border/50">
                {record.thumbnailBase64 ? (
                  <button onClick={() => onOpenThumbnail(record.thumbnailBase64!, record.timestampFormatted, record.videoName)} className="w-full h-full" data-testid={`button-history-thumbnail-${record.id}`}>
                    <img src={record.thumbnailBase64} alt="Detection frame" className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-foreground/80">{record.videoName}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={`text-xs font-mono ${record.detected ? "text-primary" : "text-muted-foreground"}`}>
                    {record.detected ? (record.timestampFormatted ?? "detected") : "no fire"}
                  </span>
                  {record.confidence && record.detected && <span className="text-xs text-muted-foreground capitalize">{record.confidence}</span>}
                  <span className="text-xs text-muted-foreground">{formatDate(record.createdAt)}</span>
                </div>
              </div>
              <div className={`flex-shrink-0 w-2 h-2 rounded-full ${record.detected ? "bg-primary" : "bg-muted-foreground/30"}`} />
              <button onClick={() => deleteMutation.mutate({ id: record.id })} className="flex-shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors" data-testid={`button-delete-${record.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Fire Alert Overlay ────────────────────────────────────────────────────── */

interface FireAlertOverlayProps {
  frameBase64: string;
  wallTime: string;
  confidence: string;
  onAcknowledge: () => void;
  onStop: () => void;
}

function FireAlertOverlay({ frameBase64, wallTime, confidence, onAcknowledge, onStop }: FireAlertOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" data-testid="fire-alert-overlay">
      {/* Red pulsing background */}
      <div className="absolute inset-0 bg-red-950 animate-pulse" style={{ animationDuration: "1s" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-red-900/80 via-red-950 to-black/90" />

      <div className="relative flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-800/60">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="font-mono font-bold text-red-100 tracking-widest uppercase text-sm">
              FIRE DETECTED — ALERT
            </span>
          </div>
          <FirewatchLogo className="h-7 w-auto opacity-80" />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
          {/* Incident meta */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
            <div className="bg-red-900/40 border border-red-800/50 rounded-sm p-3">
              <p className="text-xs font-mono text-red-300 uppercase mb-1">Incident Time</p>
              <p className="text-lg font-mono text-red-100 font-bold">{formatWallTime(wallTime)}</p>
            </div>
            <div className="bg-red-900/40 border border-red-800/50 rounded-sm p-3">
              <p className="text-xs font-mono text-red-300 uppercase mb-1">Confidence</p>
              <p className="text-lg font-mono text-red-100 font-bold capitalize">{confidence}</p>
            </div>
          </div>

          {/* Frame */}
          <div className="w-full max-w-lg border-2 border-red-600/70 rounded-sm overflow-hidden shadow-2xl shadow-red-900">
            <div className="bg-red-900/60 px-3 py-1.5 flex items-center gap-2">
              <AlertOctagon className="w-3.5 h-3.5 text-red-300" />
              <span className="text-xs font-mono text-red-300 uppercase tracking-wider">Detection Frame</span>
            </div>
            <img src={frameBase64} alt="Fire detection frame" className="w-full object-contain max-h-64" data-testid="fire-alert-frame" />
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <Button
              onClick={onAcknowledge}
              className="font-mono uppercase tracking-wider text-xs bg-red-700 hover:bg-red-600 border border-red-600 text-white px-6"
              data-testid="button-acknowledge"
            >
              <Activity className="w-3.5 h-3.5 mr-2" />
              Acknowledge — Continue Monitoring
            </Button>
            <Button
              variant="outline"
              onClick={onStop}
              className="font-mono uppercase tracking-wider text-xs border-red-800 text-red-300 hover:bg-red-900/50 hover:text-red-100 px-6"
              data-testid="button-stop-monitoring"
            >
              <PowerOff className="w-3.5 h-3.5 mr-2" />
              Stop Monitoring
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Live Monitor Tab ──────────────────────────────────────────────────────── */

interface LiveMonitorProps {
  onHistoryInvalidate: () => void;
}

function LiveMonitor({ onHistoryInvalidate }: LiveMonitorProps) {
  const [rtspUrl, setRtspUrl] = useState("");
  const { status, latestFrame, latestAnalysis, fireAlert, error, frameCount, start, stop, dismissAlert, reset } = useLiveStream();

  // Invalidate history whenever we stop or fire is detected
  useEffect(() => {
    if (status === "stopped" || fireAlert) {
      onHistoryInvalidate();
    }
  }, [status, fireAlert, onHistoryInvalidate]);

  const isRunning = status === "active" || status === "connecting";

  const handleToggle = () => {
    if (isRunning) {
      stop();
    } else {
      if (!rtspUrl.trim()) return;
      start(rtspUrl.trim());
    }
  };

  const handleAcknowledge = () => {
    dismissAlert();
    onHistoryInvalidate();
    // continue monitoring (stream still active)
  };

  const handleStop = () => {
    stop();
    dismissAlert();
    onHistoryInvalidate();
  };

  return (
    <>
      {/* Fire Alert Overlay */}
      {fireAlert && (
        <FireAlertOverlay
          frameBase64={fireAlert.frameBase64}
          wallTime={fireAlert.wallTime}
          confidence={fireAlert.confidence}
          onAcknowledge={handleAcknowledge}
          onStop={handleStop}
        />
      )}

      <div className="space-y-4">
        {/* URL + Toggle */}
        <Card className="border-border/50 shadow-none bg-card/30">
          <CardContent className="pt-5 pb-5">
            <div className="flex gap-3 items-center">
              <div className="flex-1 relative">
                <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  placeholder="rtsp://username:password@192.168.1.100:554/stream"
                  className="pl-9 font-mono text-xs bg-background/60 border-border"
                  disabled={isRunning}
                  data-testid="input-rtsp-url"
                />
              </div>
              <Button
                onClick={handleToggle}
                disabled={!rtspUrl.trim() && !isRunning}
                className={`font-mono uppercase tracking-wider text-xs px-6 min-w-[88px] ${
                  isRunning
                    ? "bg-destructive hover:bg-destructive/80 text-white border-0"
                    : ""
                }`}
                data-testid="button-live-toggle"
              >
                {isRunning ? (
                  <><PowerOff className="w-3.5 h-3.5 mr-2" />OFF</>
                ) : (
                  <><Power className="w-3.5 h-3.5 mr-2" />ON</>
                )}
              </Button>
            </div>

            {/* Status row */}
            <div className="mt-3 flex items-center gap-2">
              {status === "idle" && (
                <span className="text-xs text-muted-foreground font-mono">Enter RTSP URL and press ON to begin monitoring.</span>
              )}
              {status === "connecting" && (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
                  </span>
                  <span className="text-xs text-yellow-500 font-mono">Connecting to stream…</span>
                </>
              )}
              {status === "active" && (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-xs text-green-500 font-mono">
                    Live — {frameCount} frame{frameCount !== 1 ? "s" : ""} analyzed
                    {latestAnalysis && (
                      <span className={`ml-2 ${latestAnalysis.detected ? "text-primary" : "text-muted-foreground"}`}>
                        · last: {latestAnalysis.detected ? `FIRE (${latestAnalysis.confidence})` : "clear"}
                      </span>
                    )}
                  </span>
                </>
              )}
              {status === "stopped" && (
                <>
                  <WifiOff className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono">Monitoring stopped. {frameCount} frame{frameCount !== 1 ? "s" : ""} analyzed.</span>
                  <button onClick={reset} className="text-xs text-primary font-mono hover:underline ml-1">Reset</button>
                </>
              )}
              {status === "error" && (
                <>
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                  <span className="text-xs text-destructive font-mono">{error}</span>
                  <button onClick={reset} className="text-xs text-primary font-mono hover:underline ml-1">Reset</button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Frame Display */}
        {(status === "active" || status === "connecting" || (status === "stopped" && latestFrame)) && (
          <Card className="border-border/50 shadow-none bg-card/30 overflow-hidden">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Radio className="w-3 h-3" />
                  Live Feed
                </span>
                {latestFrame && (
                  <span className="text-muted-foreground/60">
                    {formatWallTime(latestFrame.wallTime)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`relative rounded-sm overflow-hidden border ${
                latestAnalysis?.detected ? "border-primary/70" : "border-border/50"
              }`}>
                {latestFrame ? (
                  <>
                    <img
                      src={latestFrame.frameBase64}
                      alt="Live CCTV frame"
                      className="w-full object-contain bg-black"
                      style={{ maxHeight: "320px" }}
                      data-testid="live-frame-image"
                    />
                    {/* Status badge on frame */}
                    <div className="absolute top-2 left-2">
                      {latestAnalysis ? (
                        <span className={`font-mono text-xs px-2 py-0.5 rounded-sm uppercase ${
                          latestAnalysis.detected
                            ? "bg-primary/90 text-primary-foreground"
                            : "bg-black/70 text-green-400"
                        }`}>
                          {latestAnalysis.detected ? `FIRE — ${latestAnalysis.confidence}` : "Clear"}
                        </span>
                      ) : (
                        <span className="font-mono text-xs px-2 py-0.5 rounded-sm bg-black/70 text-yellow-400">Analyzing…</span>
                      )}
                    </div>
                    {/* Pulse ring when active */}
                    {status === "active" && (
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-sm">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span className="text-xs font-mono text-green-400">LIVE</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full bg-black/60 flex items-center justify-center py-16">
                    <p className="text-xs font-mono text-muted-foreground">Waiting for first frame…</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

/* ─── Main Home Page ────────────────────────────────────────────────────────── */

type Tab = "upload" | "live";

export default function Home() {
  const [tab, setTab] = useState<Tab>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbnailModal, setThumbnailModal] = useState<{ open: boolean; src: string; label?: string | null; name?: string }>({ open: false, src: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { status, progress, result, error, analyze, reset } = useFireDetection();

  const invalidateHistory = () => queryClient.invalidateQueries({ queryKey: getGetFireDetectionHistoryQueryKey() });

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type.startsWith("video/")) { setFile(dropped); reset(); }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { setFile(e.target.files[0]); reset(); }
  };
  const handleAnalyze = () => {
    if (file) {
      analyze(file);
      setTimeout(invalidateHistory, 3000);
    }
  };
  const handleReset = () => {
    setFile(null); reset(); invalidateHistory();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10" data-testid="header">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <FirewatchLogo className="h-8 w-auto" />
          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-md p-1">
            <button
              onClick={() => setTab("upload")}
              className={`font-mono uppercase tracking-wider text-xs px-4 py-1.5 rounded transition-colors ${
                tab === "upload" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-upload"
            >
              Upload
            </button>
            <button
              onClick={() => setTab("live")}
              className={`font-mono uppercase tracking-wider text-xs px-4 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                tab === "live" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-live"
            >
              <Radio className="w-3 h-3" />
              Live
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl flex flex-col gap-8">

        {/* ── Upload Tab ── */}
        {tab === "upload" && (
          <>
            {status === "idle" && (
              <Card className="border-border/50 shadow-none bg-card/30">
                <CardContent className="pt-6">
                  <div
                    className={`relative border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center transition-colors duration-200 cursor-pointer ${
                      isDragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-border"
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    data-testid="upload-zone"
                  >
                    <input type="file" ref={fileInputRef} className="hidden" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm" onChange={handleFileSelect} data-testid="input-video" />
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                      <UploadCloud className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">{file ? file.name : "Select or drop video file"}</p>
                    <p className="text-xs text-muted-foreground">{file ? formatBytes(file.size) : "MP4, MOV, AVI, WEBM supported"}</p>
                  </div>
                  {file && (
                    <div className="mt-6 flex justify-end">
                      <Button onClick={(e) => { e.stopPropagation(); handleAnalyze(); }} className="font-mono uppercase tracking-wider text-xs px-8" data-testid="button-analyze">
                        Initialize Analysis
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {(status === "uploading" || status === "analyzing") && (
              <Card className="border-border shadow-none bg-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                      </span>
                      {status === "uploading" ? "Uploading Stream" : "Analysis in Progress"}
                    </span>
                    <span className="text-muted-foreground">{progress ? `${Math.round((progress.current / progress.total) * 100)}%` : "0%"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 bg-secondary/50 rounded-md p-3 border border-border/50">
                      <FileVideo className="w-5 h-5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium">{file?.name}</p>
                        <p className="text-xs text-muted-foreground">{file ? formatBytes(file.size) : ""}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Progress value={progress ? (progress.current / progress.total) * 100 : 0} className="h-1" />
                      <p className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                        <span className="text-primary">&gt;</span> {progress?.message || "Initializing engine…"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {status === "complete" && result && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className={`border shadow-none ${result.detected ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card/30"}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 p-2 rounded-sm ${result.detected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {result.detected ? <AlertOctagon className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                      </div>
                      <div className="flex-1">
                        <h3 className={`text-lg font-bold uppercase tracking-tight ${result.detected ? "text-primary" : "text-foreground"}`}>
                          {result.detected ? "Thermal Anomaly Detected" : "No Anomalies Detected"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                        {result.detected && (
                          <>
                            <div className="mt-6 grid grid-cols-2 gap-4">
                              <div className="bg-background rounded-sm border border-border p-3">
                                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Timestamp</p>
                                <p className="text-xl font-mono">{result.timestampFormatted || "00:00"}</p>
                              </div>
                              <div className="bg-background rounded-sm border border-border p-3">
                                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Confidence</p>
                                <p className="text-xl font-mono capitalize">{result.confidence || "High"}</p>
                              </div>
                            </div>
                            {result.thumbnailBase64 && (
                              <div className="mt-4">
                                <button
                                  onClick={() => setThumbnailModal({ open: true, src: result.thumbnailBase64!, label: result.timestampFormatted, name: file?.name })}
                                  className="group relative w-full overflow-hidden rounded-sm border border-border hover:border-primary/50 transition-colors duration-200 block"
                                  data-testid="button-view-thumbnail"
                                >
                                  <img src={result.thumbnailBase64} alt={`Frame at ${result.timestampFormatted}`} className="w-full object-cover max-h-48 opacity-80 group-hover:opacity-100 transition-opacity" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="flex items-center gap-2 bg-background/90 rounded px-3 py-1.5 text-xs font-mono uppercase tracking-wider">
                                      <Eye className="w-3 h-3" /> Inspect Frame
                                    </div>
                                  </div>
                                  <div className="absolute top-2 left-2 bg-primary/90 text-primary-foreground font-mono text-xs px-2 py-0.5 rounded-sm">{result.timestampFormatted}</div>
                                </button>
                                <p className="text-xs text-muted-foreground font-mono mt-1.5">Click to verify — human confirmation recommended before escalation.</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-start">
                  <Button variant="outline" onClick={handleReset} className="font-mono text-xs uppercase tracking-wider" data-testid="button-new-analysis">
                    <RotateCcw className="w-3 h-3 mr-2" /> Analyze New Source
                  </Button>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="space-y-6">
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
                  <AlertTriangle className="h-4 w-4 !text-destructive" />
                  <AlertTitle className="font-mono uppercase text-destructive tracking-wider">System Error</AlertTitle>
                  <AlertDescription className="text-sm mt-1 text-destructive/90">{error || "An unexpected error occurred."}</AlertDescription>
                </Alert>
                <Button variant="outline" onClick={handleReset} className="font-mono text-xs uppercase tracking-wider" data-testid="button-retry">
                  <RotateCcw className="w-3 h-3 mr-2" /> Retry
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── Live Tab ── */}
        {tab === "live" && <LiveMonitor onHistoryInvalidate={invalidateHistory} />}

        {/* ── History (always visible) ── */}
        <HistoryPanel onOpenThumbnail={(src, label, name) => setThumbnailModal({ open: true, src, label, name })} />
      </main>

      {/* Thumbnail Modal */}
      {thumbnailModal.open && (
        <ThumbnailModal
          open={thumbnailModal.open}
          onClose={() => setThumbnailModal((p) => ({ ...p, open: false }))}
          thumbnailBase64={thumbnailModal.src}
          label={thumbnailModal.label}
          videoName={thumbnailModal.name}
        />
      )}
    </div>
  );
}
