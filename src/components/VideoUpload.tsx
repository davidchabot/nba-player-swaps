import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, Film, Clock, ArrowRight, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { VideoClip } from "@/types";
import { uploadVideo } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function VideoUpload() {
  const { setVideoClip, setVideoFile, setVideoDbId, setVideoPublicUrl, setCurrentStep } = useApp();
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ duration: number; resolution: string } | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith("video/")) return;
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 100MB", variant: "destructive" });
      return;
    }

    setLocalFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      setMetadata({ duration: video.duration, resolution: `${video.videoWidth}x${video.videoHeight}` });
    };
    video.src = url;
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const confirmUpload = useCallback(async () => {
    if (!localFile || !metadata) return;
    setIsUploading(true);

    try {
      // Upload to storage and create DB record
      const { videoId, videoUrl } = await uploadVideo(localFile);

      const clip: VideoClip = {
        id: videoId,
        filename: localFile.name,
        url: preview || videoUrl,
        durationSeconds: metadata.duration,
        fps: 30,
        resolution: metadata.resolution,
        status: "uploaded",
        createdAt: new Date(),
      };

      setVideoClip(clip);
      setVideoFile(localFile);
      setVideoDbId(videoId);
      setVideoPublicUrl(videoUrl);

      toast({ title: "Video Uploaded!", description: "Starting analysis..." });
      setCurrentStep("analyzing");
    } catch (err) {
      console.error("Video upload error:", err);
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Failed to upload video",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [localFile, metadata, preview, setVideoClip, setVideoFile, setVideoDbId, setVideoPublicUrl, setCurrentStep, toast]);

  const clearFile = () => {
    setPreview(null);
    setMetadata(null);
    setLocalFile(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 court-pattern">
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 w-full max-w-xl">
        <div className="text-center mb-8">
          <span className="text-xs font-mono text-primary font-bold tracking-wider uppercase">Step 2</span>
          <h2 className="font-display text-3xl font-bold mt-2">Upload Video</h2>
          <p className="text-muted-foreground mt-2">Upload a basketball clip (max 30 seconds)</p>
        </div>

        <div className="glass rounded-2xl p-6 space-y-6">
          {!preview ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative aspect-video rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-4
                ${dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/40"}`}
            >
              <motion.div animate={{ y: dragActive ? -5 : 0 }} className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </motion.div>
              <div className="text-center">
                <p className="font-display font-semibold">Drop your video here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
              </div>
              <div className="flex gap-2">
                {["MP4", "MOV", "WebM"].map((fmt) => (
                  <span key={fmt} className="px-2 py-0.5 rounded text-xs bg-secondary text-muted-foreground">{fmt}</span>
                ))}
              </div>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
                <video ref={videoPreviewRef} src={preview} controls className="w-full h-full object-contain" />
                <button onClick={clearFile} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {metadata && (
                <div className="flex gap-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Film className="w-4 h-4" /><span>{localFile?.name}</span></div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="w-4 h-4" /><span>{metadata.duration.toFixed(1)}s</span></div>
                  <span className="text-sm text-muted-foreground">{metadata.resolution}</span>
                </div>
              )}
            </motion.div>
          )}

          <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleFileChange} className="hidden" />

          {preview && metadata && (
            <Button onClick={confirmUpload} className="w-full glow-primary" size="lg" disabled={isUploading}>
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <>Analyze Video <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          )}

          <Button variant="ghost" onClick={() => setCurrentStep("avatar")} className="w-full text-muted-foreground">
            ← Back to Avatar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
