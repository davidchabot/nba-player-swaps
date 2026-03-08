"use client";

import React from "react";
import { useState, useRef, useCallback } from "react";
import {
  User,
  LogOut,
  Plus,
  Check,
  Upload,
  Play,
  Film,
  Download,
  RotateCcw,
  Loader2,
  Video,
  AlertCircle,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { VideoAnalysisResult, Track } from "@/lib/types";
import { VideoAnalysisPlayer } from "@/components/video-analysis/VideoAnalysisPlayer";
import { TrackSelectionPanel } from "@/components/video-analysis/TrackSelectionPanel";

interface ScannedAvatar {
  id: string;
  name: string;
  thumbnail: string;
}

interface StreamingDashboardProps {
  avatars: ScannedAvatar[];
  onAddAvatar: () => void;
}

type WorkflowStep =
  | "upload"
  | "uploading"
  | "analyzing"
  | "select-player"
  | "processing"
  | "complete"
  | "error";

export function StreamingDashboard({
  avatars,
  onAddAvatar,
}: StreamingDashboardProps) {
  const [selectedAvatar, setSelectedAvatar] = useState<ScannedAvatar | null>(
    avatars[0] || null
  );
  const [uploadedClip, setUploadedClip] = useState<string | null>(null);
  const [clipName, setClipName] = useState<string>("");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("upload");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysisResult | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = (avatar: ScannedAvatar) => {
    setSelectedAvatar(avatar);
  };

  // Poll for analysis job completion
  const pollAnalysisJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/analysis/${jobId}`);
      if (!res.ok) {
        throw new Error("Failed to get analysis status");
      }

      const job = await res.json();
      setAnalysisProgress(job.progress || 0);

      if (job.status === "completed") {
        if (job.result && job.result.tracks && job.result.tracks.length > 0) {
          setAnalysisResult(job.result);
          setWorkflowStep("select-player");
        } else {
          setErrorMessage(
            "No players detected in the video. Try uploading a different clip with visible players."
          );
          setWorkflowStep("error");
        }
      } else if (job.status === "failed") {
        setErrorMessage(job.errorMessage || "Analysis failed. Please try again.");
        setWorkflowStep("error");
      } else {
        // Still processing, poll again
        setTimeout(() => pollAnalysisJob(jobId), 1500);
      }
    } catch (error) {
      console.error("Analysis polling error:", error);
      setErrorMessage("Failed to get analysis results. Please try again.");
      setWorkflowStep("error");
    }
  }, []);

  // Poll for replacement job completion
  const pollReplacementJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/replacement/${jobId}`);
        if (!res.ok) {
          throw new Error("Failed to get replacement status");
        }

        const job = await res.json();

        if (job.status === "completed") {
          setProcessingProgress(100);
          setOutputVideoUrl(job.outputUrl);
          setWorkflowStep("complete");
        } else if (job.status === "failed") {
          setErrorMessage(job.errorMessage || "Replacement failed. Please try again.");
          setWorkflowStep("error");
        } else {
          // Still processing, update progress and poll again
          setProcessingProgress(job.progress || Math.min(processingProgress + 5, 95));
          setTimeout(() => pollReplacementJob(jobId), 2000);
        }
      } catch (error) {
        console.error("Replacement polling error:", error);
        setErrorMessage("Failed to get replacement results. Please try again.");
        setWorkflowStep("error");
      }
    },
    [processingProgress]
  );

  const handleClipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setErrorMessage(null);
    setClipName(file.name);
    const localUrl = URL.createObjectURL(file);
    setUploadedClip(localUrl);
    setWorkflowStep("uploading");
    setUploadProgress("Uploading video...");
    setAnalysisResult(null);
    setSelectedTrackId(null);

    try {
      // Step 1: Upload video
      const formData = new FormData();
      formData.append("video", file);

      const uploadRes = await fetch("/api/videos", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const error = await uploadRes.json();
        throw new Error(error.error || "Failed to upload video");
      }

      const { id: uploadedVideoId } = await uploadRes.json();
      setVideoId(uploadedVideoId);

      // Step 2: Start analysis
      setWorkflowStep("analyzing");
      setUploadProgress("Analyzing video...");
      setAnalysisProgress(0);

      const analysisRes = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoClipId: uploadedVideoId }),
      });

      if (!analysisRes.ok) {
        const error = await analysisRes.json();
        throw new Error(error.error || "Failed to start analysis");
      }

      const { jobId } = await analysisRes.json();

      // Poll for analysis completion
      pollAnalysisJob(jobId);
    } catch (error) {
      console.error("Upload/Analysis error:", error);
      setErrorMessage(error instanceof Error ? error.message : "An error occurred");
      setWorkflowStep("error");
    }
  };

  const handleTrackSelect = (trackId: string, frameNumber?: number) => {
    setSelectedTrackId(trackId);
    if (frameNumber !== undefined) {
      setCurrentFrame(frameNumber);
    }
  };

  const handleFrameChange = (frameNumber: number) => {
    setCurrentFrame(frameNumber);
  };

  const handleStartReplacement = async () => {
    if (!selectedAvatar || !videoId || !selectedTrackId) {
      setErrorMessage("Please select an avatar and a player");
      setWorkflowStep("error");
      return;
    }

    setWorkflowStep("processing");
    setProcessingProgress(0);
    setErrorMessage(null);

    try {
      // Start replacement with the selected track
      const res = await fetch("/api/replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoClipId: videoId,
          trackId: selectedTrackId,
          avatarId: selectedAvatar.id,
          options: { quality: "standard" },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to start replacement");
      }

      const { jobId } = await res.json();
      setProcessingProgress(5);

      // Poll for completion
      pollReplacementJob(jobId);
    } catch (error) {
      console.error("Replacement error:", error);
      setErrorMessage(error instanceof Error ? error.message : "Replacement failed");
      setWorkflowStep("error");
    }
  };

  const handleReset = () => {
    setUploadedClip(null);
    setClipName("");
    setWorkflowStep("upload");
    setProcessingProgress(0);
    setErrorMessage(null);
    setUploadProgress("");
    setVideoId(null);
    setOutputVideoUrl(null);
    setAnalysisResult(null);
    setSelectedTrackId(null);
    setCurrentFrame(0);
    setAnalysisProgress(0);
  };

  const selectedTrack = analysisResult?.tracks.find(
    (t) => t.trackId === selectedTrackId
  );

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Navigation Sidebar */}
      <nav className="flex w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-20">
        {/* Profile */}
        <div className="mb-8">
          <Avatar className="h-10 w-10 border-2 border-transparent lg:h-12 lg:w-12">
            <AvatarImage src="/placeholder.svg" alt="User profile" />
            <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
              D
            </AvatarFallback>
          </Avatar>
          <p className="mt-1 hidden text-center text-xs text-muted-foreground lg:block">
            David
          </p>
        </div>

        {/* Nav Icons */}
        <div className="flex flex-1 flex-col items-center gap-4">
          <button
            className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary transition-colors lg:h-12 lg:w-12"
            aria-label="Create Video"
          >
            <Film className="h-5 w-5 lg:h-6 lg:w-6" />
            <div className="absolute -bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />
          </button>

          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-12 lg:w-12"
            aria-label="My Videos"
          >
            <Video className="h-5 w-5 lg:h-6 lg:w-6" />
          </button>

          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-12 lg:w-12"
            aria-label="Avatar Settings"
          >
            <User className="h-5 w-5 lg:h-6 lg:w-6" />
          </button>
        </div>

        {/* Sign Out */}
        <button
          className="flex items-center justify-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Sign Out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden lg:inline">Sign Out</span>
        </button>
      </nav>

      {/* Avatar Panel */}
      <div className="flex w-44 flex-col border-r border-border bg-card lg:w-56">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">My Avatars</h2>
          <p className="mt-1 text-xs text-muted-foreground">Select who to insert</p>
        </div>

        <ScrollArea className="flex-1 p-4">
          {/* Add New Button */}
          <button
            onClick={onAddAvatar}
            className="mb-4 flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-current">
              <Plus className="h-6 w-6" />
            </div>
            <span className="text-xs">Create Avatar</span>
          </button>

          {/* Avatar List */}
          <div className="space-y-3">
            {avatars.map((avatar) => (
              <button
                key={avatar.id}
                onClick={() => handleAvatarSelect(avatar)}
                className={cn(
                  "w-full rounded-lg p-2 transition-all",
                  selectedAvatar?.id === avatar.id
                    ? "bg-primary/10 ring-2 ring-primary"
                    : "hover:bg-muted"
                )}
              >
                <div className="aspect-[3/4] w-full overflow-hidden rounded-md bg-muted">
                  {avatar.thumbnail ? (
                    <img
                      src={avatar.thumbnail || "/placeholder.svg"}
                      alt={avatar.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <User className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-center text-xs font-medium text-foreground">
                  {avatar.name}
                </p>
                {selectedAvatar?.id === avatar.id && (
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <Check className="h-3 w-3 text-primary" />
                    <span className="text-xs text-primary">Selected</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col bg-background overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-3">
            <Film className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Create Avatar Video
            </span>
          </div>
          {selectedAvatar && (
            <div className="rounded-md bg-muted px-3 py-1">
              <span className="text-xs text-muted-foreground">
                Using:{" "}
                <span className="font-medium text-foreground">
                  {selectedAvatar.name}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main video/content area */}
          <div className="flex flex-1 items-center justify-center p-6 overflow-auto">
            <div className="w-full max-w-4xl">
              {/* Step 1: Upload Clip */}
              {workflowStep === "upload" && (
                <div className="flex flex-col items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleClipUpload}
                    className="hidden"
                  />

                  {!selectedAvatar ? (
                    <div className="text-center">
                      <User className="mx-auto h-16 w-16 text-muted-foreground/30" />
                      <h2 className="mt-4 text-xl font-semibold text-foreground">
                        Select an Avatar First
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Choose an avatar from the left panel, or create a new one
                      </p>
                      <button
                        onClick={onAddAvatar}
                        className="mt-6 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Create Your Avatar
                      </button>
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="text-center">
                        <h2 className="text-xl font-semibold text-foreground">
                          Upload a Basketball Clip
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Upload any clip and we'll detect players for you to select
                        </p>
                      </div>

                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-8 flex aspect-video w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card transition-all hover:border-primary/50 hover:bg-muted/50"
                      >
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                          <Upload className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="mt-4 text-base font-medium text-foreground">
                          Click to upload video
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          MP4, MOV, or WebM
                        </p>
                      </button>

                      <div className="mt-6 rounded-lg bg-muted/50 p-4">
                        <p className="text-xs text-muted-foreground">
                          <strong className="text-foreground">Tip:</strong> For best
                          results, upload clips where players are clearly visible. We
                          support clips up to 30 seconds.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 1.5: Uploading */}
              {workflowStep === "uploading" && (
                <div className="flex flex-col items-center">
                  <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900">
                    {uploadedClip && (
                      <video
                        src={uploadedClip}
                        className="h-full w-full object-cover opacity-50"
                        muted
                        loop
                        autoPlay
                      />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="mt-4 text-lg font-medium text-white">
                        {uploadProgress}
                      </p>
                      <p className="mt-1 text-sm text-white/60">Please wait...</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{clipName}</p>
                </div>
              )}

              {/* Step 2: Analyzing */}
              {workflowStep === "analyzing" && (
                <div className="flex flex-col items-center">
                  <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900">
                    {uploadedClip && (
                      <video
                        src={uploadedClip}
                        className="h-full w-full object-cover opacity-50"
                        muted
                        loop
                        autoPlay
                      />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="mt-4 text-lg font-medium text-white">
                        Analyzing video...
                      </p>
                      <p className="mt-1 text-sm text-white/60">
                        Detecting and tracking players
                      </p>
                      <div className="mt-4 w-48">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                          <div
                            className="h-full bg-primary transition-all duration-200"
                            style={{ width: `${analysisProgress}%` }}
                          />
                        </div>
                        <p className="mt-2 text-center text-xs text-white/40">
                          {analysisProgress}%
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{clipName}</p>
                </div>
              )}

              {/* Error State */}
              {workflowStep === "error" && (
                <div className="flex flex-col items-center">
                  <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900">
                    {uploadedClip && (
                      <video
                        src={uploadedClip}
                        className="h-full w-full object-cover opacity-30"
                        muted
                      />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                      </div>
                      <p className="mt-4 text-lg font-medium text-white">
                        Something went wrong
                      </p>
                      <p className="mt-2 max-w-md text-center text-sm text-white/60">
                        {errorMessage}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    className="mt-6 flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Try Again
                  </button>
                </div>
              )}

              {/* Step 3: Select Player - Now with video player and track overlay */}
              {workflowStep === "select-player" && uploadedClip && (
                <div className="flex flex-col">
                  {/* Video with track overlay */}
                  <VideoAnalysisPlayer
                    videoUrl={uploadedClip}
                    analysisResult={analysisResult}
                    selectedTrackId={selectedTrackId}
                    onTrackSelect={handleTrackSelect}
                    onFrameChange={handleFrameChange}
                  />

                  {/* Selection status and action */}
                  <div className="mt-6 flex items-center justify-between">
                    <div>
                      {selectedTrack ? (
                        <div className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-green-500" />
                          <span className="text-sm font-medium">
                            Player selected (Quality: {Math.round(selectedTrack.quality.score * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Click on a player in the video or select from the panel
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Different Clip
                      </button>
                      <button
                        onClick={handleStartReplacement}
                        disabled={!selectedTrackId}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-medium transition-colors",
                          selectedTrackId
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                      >
                        <Play className="h-4 w-4" />
                        Start Replacement
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Processing */}
              {workflowStep === "processing" && (
                <div className="flex flex-col items-center">
                  <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900">
                    {uploadedClip && (
                      <video
                        src={uploadedClip}
                        className="h-full w-full object-cover opacity-30"
                        muted
                        loop
                        autoPlay
                      />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-center">
                        <div className="mx-auto h-16 w-16 rounded-full border-4 border-muted bg-background p-2">
                          <div className="flex h-full w-full items-center justify-center rounded-full bg-primary/10">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        </div>
                        <p className="mt-4 text-lg font-medium text-white">
                          Creating your video...
                        </p>
                        <p className="mt-1 text-sm text-white/60">
                          Replacing player with {selectedAvatar?.name}
                        </p>
                        <p className="mt-1 text-xs text-white/40">
                          This may take a few minutes
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-6 w-full max-w-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Processing</span>
                      <span>{processingProgress}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Complete */}
              {workflowStep === "complete" && (
                <div className="flex flex-col items-center">
                  <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900">
                    {(outputVideoUrl || uploadedClip) && (
                      <video
                        src={outputVideoUrl || uploadedClip || ""}
                        className="h-full w-full object-cover"
                        controls
                        autoPlay
                      />
                    )}
                    {/* Success overlay badge */}
                    <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-green-500/90 px-3 py-1.5">
                      <Check className="h-4 w-4 text-white" />
                      <span className="text-sm font-medium text-white">Complete</span>
                    </div>
                  </div>

                  <div className="mt-6 text-center">
                    <h3 className="text-lg font-semibold text-foreground">
                      Your video is ready!
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedAvatar?.name} has been swapped into the video
                    </p>
                  </div>

                  <div className="mt-6 flex items-center gap-4">
                    <a
                      href={outputVideoUrl || uploadedClip || "#"}
                      download={`avatar-swap-${Date.now()}.mp4`}
                      className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Download className="h-5 w-5" />
                      Download Video
                    </a>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-2 rounded-lg border border-border px-6 py-3 font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Play className="h-5 w-5" />
                      Create Another
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Track Selection Panel - shown during select-player step */}
          {workflowStep === "select-player" && analysisResult && (
            <TrackSelectionPanel
              tracks={analysisResult.tracks}
              selectedTrackId={selectedTrackId}
              onTrackSelect={(trackId) => handleTrackSelect(trackId)}
              currentFrame={currentFrame}
            />
          )}
        </div>
      </main>
    </div>
  );
}
