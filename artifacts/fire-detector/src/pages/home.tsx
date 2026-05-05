import React, { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFireDetection } from "@/hooks/use-fire-detection";
import { useGetFireDetectionHistory, useDeleteFireDetectionRecord, getGetFireDetectionHistoryQueryKey } from "@workspace/api-client-react";
import { FirewatchLogo } from "@/components/FirewatchLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  UploadCloud,
  FileVideo,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  AlertOctagon,
  Trash2,
  Clock,
  Eye,
  X,
} from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface ThumbnailModalProps {
  open: boolean;
  onClose: () => void;
  thumbnailBase64: string;
  timestampFormatted?: string | null;
  videoName?: string;
}

function ThumbnailModal({ open, onClose, thumbnailBase64, timestampFormatted, videoName }: ThumbnailModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/50">
          <DialogTitle className="font-mono uppercase tracking-wider text-xs text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-primary" />
              <span>Fire Detection Frame</span>
            </span>
            {timestampFormatted && (
              <span className="text-primary font-bold text-base">{timestampFormatted}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="relative bg-black">
          <img
            src={thumbnailBase64}
            alt={`Fire detected at ${timestampFormatted}`}
            className="w-full object-contain max-h-[60vh]"
            data-testid="thumbnail-image"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
            <p className="text-xs font-mono text-muted-foreground truncate">{videoName}</p>
          </div>
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-mono">
            Human verification required. Confirm fire presence before escalation.
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="font-mono text-xs uppercase tracking-wider">
            <X className="w-3 h-3 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbnailModal, setThumbnailModal] = useState<{
    open: boolean;
    src: string;
    timestamp?: string | null;
    videoName?: string;
  }>({ open: false, src: "", timestamp: null });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { status, progress, result, error, analyze, reset } = useFireDetection();

  const { data: history, isLoading: historyLoading } = useGetFireDetectionHistory();
  const deleteMutation = useDeleteFireDetectionRecord({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFireDetectionHistoryQueryKey() });
      },
    },
  });

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type.startsWith("video/")) { setFile(dropped); reset(); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { setFile(e.target.files[0]); reset(); }
  };

  const handleAnalyze = () => {
    if (file) {
      analyze(file);
      // After analysis completes, invalidate history
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: getGetFireDetectionHistoryQueryKey() });
      }, 2000);
    }
  };

  const handleReset = () => {
    setFile(null);
    reset();
    queryClient.invalidateQueries({ queryKey: getGetFireDetectionHistoryQueryKey() });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openThumbnail = (src: string, timestamp?: string | null, videoName?: string) => {
    setThumbnailModal({ open: true, src, timestamp, videoName });
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10" data-testid="header">
        <div className="container mx-auto px-6 h-14 flex items-center">
          <FirewatchLogo className="h-8 w-auto" />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl flex flex-col gap-8">

        {/* Upload Phase */}
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
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                  onChange={handleFileSelect}
                  data-testid="input-video"
                />
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <UploadCloud className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">
                  {file ? file.name : "Select or drop video file"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file ? formatBytes(file.size) : "MP4, MOV, AVI, WEBM supported"}
                </p>
              </div>

              {file && (
                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={(e) => { e.stopPropagation(); handleAnalyze(); }}
                    className="font-mono uppercase tracking-wider text-xs px-8"
                    data-testid="button-analyze"
                  >
                    Initialize Analysis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analysis Phase */}
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
                <span className="text-muted-foreground">
                  {progress ? `${Math.round((progress.current / progress.total) * 100)}%` : "0%"}
                </span>
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
                  <p className="text-xs font-mono text-muted-foreground truncate flex items-center gap-2">
                    <span className="text-primary">&gt;</span>
                    {progress?.message || "Initializing engine…"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Phase */}
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
                            <p className="text-xl font-mono text-foreground">{result.timestampFormatted || "00:00"}</p>
                          </div>
                          <div className="bg-background rounded-sm border border-border p-3">
                            <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Confidence</p>
                            <p className="text-xl font-mono text-foreground capitalize">{result.confidence || "High"}</p>
                          </div>
                        </div>

                        {result.thumbnailBase64 && (
                          <div className="mt-4">
                            <button
                              onClick={() => openThumbnail(result.thumbnailBase64!, result.timestampFormatted, file?.name)}
                              className="group relative w-full overflow-hidden rounded-sm border border-border hover:border-primary/50 transition-colors duration-200 block"
                              data-testid="button-view-thumbnail"
                            >
                              <img
                                src={result.thumbnailBase64}
                                alt={`Frame at ${result.timestampFormatted}`}
                                className="w-full object-cover max-h-48 opacity-80 group-hover:opacity-100 transition-opacity duration-200"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <div className="flex items-center gap-2 bg-background/90 rounded px-3 py-1.5 text-xs font-mono uppercase tracking-wider">
                                  <Eye className="w-3 h-3" /> Inspect Frame
                                </div>
                              </div>
                              <div className="absolute top-2 left-2 bg-primary/90 text-primary-foreground font-mono text-xs px-2 py-0.5 rounded-sm">
                                {result.timestampFormatted}
                              </div>
                            </button>
                            <p className="text-xs text-muted-foreground font-mono mt-1.5">
                              Click to verify — human confirmation recommended before escalation.
                            </p>
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
                <RotateCcw className="w-3 h-3 mr-2" />
                Analyze New Source
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === "error" && (
          <div className="space-y-6">
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive-foreground">
              <AlertTriangle className="h-4 w-4 !text-destructive" />
              <AlertTitle className="font-mono uppercase text-destructive tracking-wider">System Error</AlertTitle>
              <AlertDescription className="text-sm mt-1 text-destructive/90">
                {error || "An unexpected error occurred during processing."}
              </AlertDescription>
            </Alert>
            <div className="flex justify-start">
              <Button variant="outline" onClick={handleReset} className="font-mono text-xs uppercase tracking-wider" data-testid="button-retry">
                <RotateCcw className="w-3 h-3 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* History Log */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" /> Detection History
            </h2>
            {history && history.length > 0 && (
              <span className="text-xs text-muted-foreground font-mono">{history.length} record{history.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {historyLoading ? (
            <div className="text-xs text-muted-foreground font-mono py-4">Loading history…</div>
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
                  {/* Thumbnail or placeholder */}
                  <div className="flex-shrink-0 w-14 h-10 rounded overflow-hidden bg-secondary border border-border/50">
                    {record.thumbnailBase64 ? (
                      <button
                        onClick={() => openThumbnail(record.thumbnailBase64!, record.timestampFormatted, record.videoName)}
                        className="w-full h-full"
                        data-testid={`button-history-thumbnail-${record.id}`}
                      >
                        <img
                          src={record.thumbnailBase64}
                          alt={`Frame at ${record.timestampFormatted}`}
                          className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
                        />
                      </button>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-foreground/80">{record.videoName}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-xs font-mono ${record.detected ? "text-primary" : "text-muted-foreground"}`}>
                        {record.detected ? (record.timestampFormatted ?? "detected") : "no fire"}
                      </span>
                      {record.confidence && record.detected && (
                        <span className="text-xs text-muted-foreground capitalize">{record.confidence}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(record.createdAt)}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full ${record.detected ? "bg-primary" : "bg-muted-foreground/30"}`} />

                  {/* Delete */}
                  <button
                    onClick={() => deleteMutation.mutate({ id: record.id })}
                    className="flex-shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors"
                    data-testid={`button-delete-${record.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Thumbnail Modal */}
      {thumbnailModal.open && (
        <ThumbnailModal
          open={thumbnailModal.open}
          onClose={() => setThumbnailModal((p) => ({ ...p, open: false }))}
          thumbnailBase64={thumbnailModal.src}
          timestampFormatted={thumbnailModal.timestamp}
          videoName={thumbnailModal.videoName}
        />
      )}
    </div>
  );
}
