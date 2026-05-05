import React, { useState, useRef } from "react";
import { useFireDetection } from "@/hooks/use-fire-detection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { UploadCloud, FileVideo, Activity, AlertTriangle, CheckCircle2, RotateCcw, AlertOctagon } from "lucide-react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { status, progress, result, error, analyze, reset } = useFireDetection();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith("video/")) {
        setFile(droppedFile);
        reset();
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      reset();
    }
  };

  const handleAnalyze = () => {
    if (file) {
      analyze(file);
    }
  };

  const handleReset = () => {
    setFile(null);
    reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col font-sans">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-14 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <span className="font-mono font-bold tracking-tight text-sm uppercase text-foreground">
            FireWatch <span className="text-muted-foreground ml-2 font-normal">System Monitor v2.4</span>
          </span>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl flex flex-col gap-6">
        
        {/* Input Phase */}
        {status === "idle" && (
          <Card className="border-border/50 shadow-none bg-card/30">
            <CardContent className="pt-6">
              <div
                className={`relative border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center transition-colors duration-200 ${
                  isDragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-border"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                  onChange={handleFileSelect}
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
                  >
                    Initialize Analysis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Active Analysis Phase */}
        {(status === "uploading" || status === "analyzing") && (
          <Card className="border-border shadow-none bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
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
                  <Progress 
                    value={progress ? (progress.current / progress.total) * 100 : (status === "uploading" ? undefined : 0)} 
                    className="h-1"
                  />
                  <p className="text-xs font-mono text-muted-foreground truncate flex items-center gap-2">
                    <span className="text-primary">&gt;</span> 
                    {progress?.message || "Initializing engine..."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Phase */}
        {status === "complete" && result && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className={`border shadow-none ${result.detected ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-card/30'}`}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className={`mt-1 p-2 rounded-sm ${result.detected ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    {result.detected ? <AlertOctagon className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className={`text-lg font-bold uppercase tracking-tight ${result.detected ? 'text-primary' : 'text-foreground'}`}>
                      {result.detected ? "Thermal Anomaly Detected" : "No Anomalies Detected"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {result.message}
                    </p>

                    {result.detected && (
                      <div className="mt-6 grid grid-cols-2 gap-4">
                        <div className="bg-background rounded-sm border border-border p-3">
                          <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Timestamp</p>
                          <p className="text-xl font-mono text-foreground">{result.timestampFormatted || "00:00:00"}</p>
                        </div>
                        <div className="bg-background rounded-sm border border-border p-3">
                          <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Confidence</p>
                          <p className="text-xl font-mono text-foreground">{result.confidence || "High"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-start">
              <Button variant="outline" onClick={handleReset} className="font-mono text-xs uppercase tracking-wider">
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
              <Button variant="outline" onClick={handleReset} className="font-mono text-xs uppercase tracking-wider">
                <RotateCcw className="w-3 h-3 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
