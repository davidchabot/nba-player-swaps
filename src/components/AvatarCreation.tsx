import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Upload, User, ArrowRight, RotateCcw, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { Avatar } from "@/types";
import { uploadAvatarImage, createAvatar } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Mode = "choose" | "camera" | "upload" | "preview";

export default function AvatarCreation() {
  const { setAvatar, setAvatarDbId, setCurrentStep } = useApp();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("choose");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [avatarName, setAvatarName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 640 },
      });
      setStream(mediaStream);
      setMode("camera");
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch {
      setMode("upload");
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
          setImageFile(file);
          setImageUrl(canvas.toDataURL("image/jpeg"));
        }
      }, "image/jpeg", 0.9);
      setMode("preview");
      stream?.getTracks().forEach((t) => t.stop());
    }
  }, [stream]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setMode("preview");
  }, []);

  const confirmAvatar = useCallback(async () => {
    if (!imageFile && !imageUrl) return;
    setIsCreating(true);

    try {
      // Upload image to storage
      let publicUrl = imageUrl || "";
      if (imageFile) {
        publicUrl = await uploadAvatarImage(imageFile);
      }

      // Call edge function to create avatar with Kling AI
      const result = await createAvatar(publicUrl, avatarName || "My Avatar");

      const avatar: Avatar = {
        id: result.avatar_id,
        name: avatarName || "My Avatar",
        sourceImageUrl: publicUrl,
        thumbnailUrl: publicUrl,
        createdAt: new Date(),
      };

      setAvatar(avatar);
      setAvatarDbId(result.avatar_id);
      toast({
        title: "Avatar Created!",
        description: "Your avatar has been processed successfully.",
      });
      setCurrentStep("upload");
    } catch (err) {
      console.error("Avatar creation error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create avatar",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  }, [imageFile, imageUrl, avatarName, setAvatar, setAvatarDbId, setCurrentStep, toast]);

  const reset = () => {
    setImageUrl(null);
    setImageFile(null);
    setMode("choose");
    stream?.getTracks().forEach((t) => t.stop());
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 court-pattern">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent/8 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <span className="text-xs font-mono text-primary font-bold tracking-wider uppercase">Step 1</span>
          <h2 className="font-display text-3xl font-bold mt-2">Create Your Avatar</h2>
          <p className="text-muted-foreground mt-2">Take a selfie or upload a photo of yourself</p>
        </div>

        <div className="glass rounded-2xl p-6 space-y-6">
          <AnimatePresence mode="wait">
            {mode === "choose" && (
              <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-4">
                <button onClick={startCamera} className="flex flex-col items-center gap-3 p-8 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:glow-primary transition-shadow">
                    <Camera className="w-7 h-7 text-primary" />
                  </div>
                  <span className="font-display font-semibold">Camera</span>
                  <span className="text-xs text-muted-foreground">Take a selfie</span>
                </button>
                <button onClick={() => setMode("upload")} className="flex flex-col items-center gap-3 p-8 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center group-hover:glow-accent transition-shadow">
                    <Upload className="w-7 h-7 text-accent" />
                  </div>
                  <span className="font-display font-semibold">Upload</span>
                  <span className="text-xs text-muted-foreground">Choose a photo</span>
                </button>
              </motion.div>
            )}

            {mode === "camera" && (
              <motion.div key="camera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
                  <div className="absolute inset-0 border-2 border-primary/30 rounded-xl pointer-events-none" />
                  <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line pointer-events-none" />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset} className="flex-1"><RotateCcw className="w-4 h-4 mr-2" /> Back</Button>
                  <Button onClick={capturePhoto} className="flex-1 glow-primary"><Camera className="w-4 h-4 mr-2" /> Capture</Button>
                </div>
                <canvas ref={canvasRef} className="hidden" />
              </motion.div>
            )}

            {mode === "upload" && (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <button onClick={() => fileInputRef.current?.click()} className="w-full aspect-square rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-3">
                  <User className="w-12 h-12 text-muted-foreground" />
                  <span className="text-muted-foreground">Click to upload your photo</span>
                  <span className="text-xs text-muted-foreground/60">JPG, PNG up to 10MB</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                <Button variant="outline" onClick={reset} className="w-full"><RotateCcw className="w-4 h-4 mr-2" /> Back</Button>
              </motion.div>
            )}

            {mode === "preview" && imageUrl && (
              <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="relative aspect-square rounded-xl overflow-hidden">
                  <img src={imageUrl} alt="Avatar preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 rounded-xl ring-2 ring-success/50 pointer-events-none" />
                  <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-success flex items-center justify-center">
                    <Check className="w-4 h-4 text-background" />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Name your avatar (optional)"
                  value={avatarName}
                  onChange={(e) => setAvatarName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset} className="flex-1" disabled={isCreating}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Retake
                  </Button>
                  <Button onClick={confirmAvatar} className="flex-1 glow-primary" disabled={isCreating}>
                    {isCreating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                    ) : (
                      <>Continue <ArrowRight className="w-4 h-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
