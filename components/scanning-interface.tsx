"use client";

import React from "react";

import { useState, useRef } from "react";
import { X, HelpCircle, SwitchCamera, Upload, Camera, ImageIcon, Check } from "lucide-react";

interface ScanningInterfaceProps {
  onClose: () => void;
  onScanComplete: (avatarName: string, imageData?: string) => void;
}

export function ScanningInterface({
  onClose,
  onScanComplete,
}: ScanningInterfaceProps) {
  const [mode, setMode] = useState<"CAMERA" | "UPLOAD">("CAMERA");
  const [isRecording, setIsRecording] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [avatarName, setAvatarName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      setScanProgress(0);
      setShowNameInput(true);
    } else {
      setIsRecording(true);
      const interval = setInterval(() => {
        setScanProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsRecording(false);
            setShowNameInput(true);
            return 100;
          }
          return prev + 2;
        });
      }, 100);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
        setIsProcessing(true);
        // Simulate processing
        setTimeout(() => {
          setIsProcessing(false);
          setShowNameInput(true);
        }, 2000);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmAvatar = () => {
    onScanComplete(avatarName || "My Avatar", uploadedImage || undefined);
  };

  // Name input screen
  if (showNameInput) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 via-neutral-800 to-neutral-900" />
        
        {/* Top Controls */}
        <div className="relative z-10 flex items-center justify-between p-4">
          <button
            onClick={() => {
              setShowNameInput(false);
              setUploadedImage(null);
              setScanProgress(0);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            aria-label="Back"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8">
          {/* Preview */}
          <div className="mb-8 h-48 w-48 overflow-hidden rounded-full border-4 border-primary bg-neutral-800">
            {uploadedImage ? (
              <img src={uploadedImage || "/placeholder.svg"} alt="Avatar preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Check className="h-16 w-16 text-primary" />
              </div>
            )}
          </div>

          <h2 className="mb-2 text-xl font-semibold text-white">Avatar Created</h2>
          <p className="mb-8 text-sm text-white/60">Give your avatar a name</p>

          {/* Name Input */}
          <input
            type="text"
            value={avatarName}
            onChange={(e) => setAvatarName(e.target.value)}
            placeholder="Enter name (e.g., David)"
            className="mb-6 w-full max-w-xs rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-center text-white placeholder-white/40 outline-none focus:border-primary"
          />

          <button
            onClick={handleConfirmAvatar}
            className="w-full max-w-xs rounded-lg bg-primary px-6 py-3 font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Save Avatar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 via-neutral-800 to-neutral-900">
        {mode === "CAMERA" && (
          <div className="absolute inset-0 opacity-10">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                backgroundSize: "50px 50px",
              }}
            />
          </div>
        )}

        {isRecording && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 animate-pulse bg-primary/10" style={{ animationDuration: "1s" }} />
            <div
              className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/40"
              style={{ animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite" }}
            />
          </div>
        )}
      </div>

      {/* Top Controls */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </button>

        <button
          onClick={() => setShowHelp(!showHelp)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          aria-label="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

      {/* Help Tooltip */}
      {showHelp && (
        <div className="absolute left-4 right-4 top-20 z-20 rounded-lg bg-black/80 p-4 text-sm text-white backdrop-blur-sm">
          <h3 className="mb-2 font-semibold">Create Your Avatar</h3>
          <div className="space-y-2 text-white/80">
            <p><strong>Camera:</strong> Take a photo of yourself - our AI will generate a 3D avatar from your image.</p>
            <p><strong>Upload:</strong> Upload an existing photo from your gallery.</p>
            <p className="mt-3 text-xs text-white/60">Tip: Use a well-lit, front-facing photo for best results.</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-1 items-center justify-center">
        {mode === "CAMERA" ? (
          /* Camera Mode */
          <div className="relative h-[70%] w-[70%] max-w-sm">
            {/* Corner Brackets */}
            <div className="absolute -left-1 -top-1 h-12 w-12">
              <div className="absolute left-0 top-0 h-8 w-1 bg-white" />
              <div className="absolute left-0 top-0 h-1 w-8 bg-white" />
            </div>
            <div className="absolute -right-1 -top-1 h-12 w-12">
              <div className="absolute right-0 top-0 h-8 w-1 bg-white" />
              <div className="absolute right-0 top-0 h-1 w-8 bg-white" />
            </div>
            <div className="absolute -bottom-1 -left-1 h-12 w-12">
              <div className="absolute bottom-0 left-0 h-8 w-1 bg-white" />
              <div className="absolute bottom-0 left-0 h-1 w-8 bg-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-12 w-12">
              <div className="absolute bottom-0 right-0 h-8 w-1 bg-white" />
              <div className="absolute bottom-0 right-0 h-1 w-8 bg-white" />
            </div>

            {/* Silhouette */}
            <div className="flex h-full items-center justify-center">
              <div className="flex h-48 w-32 flex-col items-center justify-center opacity-30">
                <div className="h-16 w-16 rounded-full border-2 border-dashed border-white/60" />
                <div className="mt-2 h-24 w-20 rounded-t-3xl border-2 border-dashed border-white/60" />
              </div>
            </div>

            {/* Progress */}
            {isRecording && (
              <div className="absolute -bottom-8 left-0 right-0">
                <div className="mx-auto h-1.5 w-3/4 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-primary transition-all duration-100" style={{ width: `${scanProgress}%` }} />
                </div>
                <p className="mt-2 text-center text-xs text-white/80">Generating avatar... {scanProgress}%</p>
              </div>
            )}
          </div>
        ) : (
          /* Upload Mode */
          <div className="flex flex-col items-center px-8">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {uploadedImage ? (
              <div className="relative">
                <div className="h-64 w-64 overflow-hidden rounded-2xl border-2 border-white/20">
                  <img src={uploadedImage || "/placeholder.svg"} alt="Uploaded" className="h-full w-full object-cover" />
                </div>
                {isProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                    <p className="mt-3 text-sm text-white">Generating 3D avatar...</p>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-64 w-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/30 transition-colors hover:border-primary/50 hover:bg-white/5"
              >
                <Upload className="mb-4 h-12 w-12 text-white/50" />
                <p className="text-sm font-medium text-white">Tap to upload photo</p>
                <p className="mt-1 text-xs text-white/50">JPG, PNG supported</p>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="relative z-10 pb-12 pt-4">
        {!isRecording && !isProcessing && !uploadedImage && (
          <p className="mb-6 text-center text-sm text-white/80">
            {mode === "CAMERA" ? "Position yourself and tap to capture" : "Upload a photo of yourself"}
          </p>
        )}

        {/* Mode Selector */}
        <div className="mb-6 flex items-center justify-center">
          <div className="flex rounded-full bg-white/10 p-1">
            <button
              onClick={() => {
                setMode("CAMERA");
                setUploadedImage(null);
              }}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                mode === "CAMERA" ? "bg-white text-black" : "text-white/60"
              }`}
            >
              <Camera className="h-4 w-4" />
              Camera
            </button>
            <button
              onClick={() => setMode("UPLOAD")}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                mode === "UPLOAD" ? "bg-white text-black" : "text-white/60"
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Camera Controls (only show in camera mode) */}
        {mode === "CAMERA" && (
          <div className="flex items-center justify-center gap-16">
            <div className="h-12 w-12" />
            <button
              onClick={handleRecord}
              className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all ${
                isRecording ? "border-primary bg-primary/20" : "border-white bg-transparent hover:bg-white/10"
              }`}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <div className={`transition-all ${isRecording ? "h-6 w-6 rounded-sm bg-primary" : "h-16 w-16 rounded-full bg-white"}`} />
            </button>
            <button className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="Flip camera">
              <SwitchCamera className="h-6 w-6" />
            </button>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-black/80 to-transparent" />
      </div>
    </div>
  );
}
