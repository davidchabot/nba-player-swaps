"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Track, VideoAnalysisResult } from "@/lib/types";
import { LostTargetPrompt } from "./LostTargetPrompt";

interface VideoAnalysisPlayerProps {
  videoUrl: string;
  analysisResult: VideoAnalysisResult | null;
  selectedTrackId: string | null;
  onTrackSelect: (trackId: string, frameNumber: number) => void;
  onFrameChange: (frameNumber: number) => void;
}

export function VideoAnalysisPlayer({
  videoUrl,
  analysisResult,
  selectedTrackId,
  onTrackSelect,
  onFrameChange,
}: VideoAnalysisPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [showLostPrompt, setShowLostPrompt] = useState(false);
  const [isReselectMode, setIsReselectMode] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

  const fps = analysisResult?.input.fps || 30;
  const tracks = analysisResult?.tracks || [];

  // Get selected track
  const selectedTrack = tracks.find((t) => t.trackId === selectedTrackId);

  // Check if selected track is lost at current frame
  const isTrackLost = useCallback((track: Track | undefined, frame: number): boolean => {
    if (!track) return false;
    if (track.lostAtFrame !== undefined && frame >= track.lostAtFrame) {
      return true;
    }
    // Also check if current frame is outside track's range
    if (frame < track.frameRange[0] || frame > track.frameRange[1]) {
      return true;
    }
    return false;
  }, []);

  // Update frame number based on video time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const frame = Math.floor(video.currentTime * fps);
      setCurrentFrame(frame);
      onFrameChange(frame);

      // Check if we should show lost target prompt
      if (selectedTrack && isTrackLost(selectedTrack, frame) && !isReselectMode) {
        setShowLostPrompt(true);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [fps, onFrameChange, selectedTrack, isTrackLost, isReselectMode]);

  // Set up video dimensions
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [videoUrl]);

  // Draw bounding boxes on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas size to video display size
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get tracks visible at current frame
    const visibleTracks = tracks.filter((track) => {
      return (
        currentFrame >= track.frameRange[0] &&
        currentFrame <= track.frameRange[1]
      );
    });

    console.log(`Frame ${currentFrame}: Drawing ${visibleTracks.length}/${tracks.length} tracks`);

    for (const track of visibleTracks) {
      // Find detection closest to current frame
      const detection = track.detections.reduce((closest, d) => {
        if (!closest) return d;
        return Math.abs(d.frameNumber - currentFrame) <
          Math.abs(closest.frameNumber - currentFrame)
          ? d
          : closest;
      }, track.detections[0]);

      if (!detection || Math.abs(detection.frameNumber - currentFrame) > 5) {
        continue;
      }

      const isSelected = track.trackId === selectedTrackId;
      const isHovered = track.trackId === hoveredTrack;
      const isLost = isTrackLost(track, currentFrame);

      // Calculate box position in canvas coordinates
      const x = detection.boundingBox.x * canvas.width;
      const y = detection.boundingBox.y * canvas.height;
      const width = detection.boundingBox.width * canvas.width;
      const height = detection.boundingBox.height * canvas.height;

      console.log(`Drawing track ${track.trackId.slice(0, 8)}: bbox=(${x.toFixed(0)}, ${y.toFixed(0)}, ${width.toFixed(0)}x${height.toFixed(0)})`);

      // Set styles based on state
      if (isLost) {
        ctx.strokeStyle = "#f59e0b"; // amber
        ctx.setLineDash([5, 5]);
      } else if (isSelected) {
        ctx.strokeStyle = "#22c55e"; // green
        ctx.setLineDash([]);
      } else if (isHovered) {
        ctx.strokeStyle = "#3b82f6"; // blue
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "#ffffff";
        ctx.setLineDash([]);
      }

      ctx.lineWidth = isSelected ? 3 : 2;

      // Draw bounding box
      ctx.strokeRect(x, y, width, height);

      // Draw track ID label
      const label = `P${track.trackId.slice(0, 4)}`;
      ctx.font = "12px sans-serif";
      const labelWidth = ctx.measureText(label).width + 8;
      const labelHeight = 18;

      // Label background
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(x, y - labelHeight, labelWidth, labelHeight);

      // Label text
      ctx.fillStyle = "#000000";
      ctx.fillText(label, x + 4, y - 5);

      // Reset line dash
      ctx.setLineDash([]);
    }
  }, [currentFrame, tracks, selectedTrackId, hoveredTrack, isTrackLost]);

  // Handle click on canvas to select track
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Find track at clicked position
    for (const track of tracks) {
      const detection = track.detections.find(
        (d) => Math.abs(d.frameNumber - currentFrame) <= 2
      );

      if (!detection) continue;

      const box = detection.boundingBox;
      if (
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height
      ) {
        onTrackSelect(track.trackId, currentFrame);
        setShowLostPrompt(false);
        setIsReselectMode(false);
        return;
      }
    }
  };

  // Handle mouse move for hover effects
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Find track at hover position
    for (const track of tracks) {
      const detection = track.detections.find(
        (d) => Math.abs(d.frameNumber - currentFrame) <= 2
      );

      if (!detection) continue;

      const box = detection.boundingBox;
      if (
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height
      ) {
        setHoveredTrack(track.trackId);
        return;
      }
    }

    setHoveredTrack(null);
  };

  const handleReselect = () => {
    setIsReselectMode(true);
    setShowLostPrompt(false);
  };

  const handleContinueAnyway = () => {
    setShowLostPrompt(false);
    setIsReselectMode(false);
  };

  return (
    <div className="relative w-full">
      {/* Demo mode banner */}
      <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2">
        <p className="text-sm text-amber-600 dark:text-amber-400">
          <strong>Demo Mode:</strong> Real player tracking unavailable (API rate limit).
          Showing placeholder positions for UI testing. Select any track to continue.
        </p>
      </div>

      {/* Video element */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full rounded-xl"
        controls
        muted
        loop
      />

      {/* Canvas overlay for bounding boxes */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setHoveredTrack(null)}
        style={{ pointerEvents: "auto" }}
      />

      {/* Reselect mode indicator */}
      {isReselectMode && (
        <div className="absolute left-4 top-4 rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">
          Tap a player to reselect
        </div>
      )}

      {/* Lost target prompt */}
      {showLostPrompt && selectedTrack && !isReselectMode && (
        <LostTargetPrompt
          trackId={selectedTrack.trackId}
          lostAtFrame={selectedTrack.lostAtFrame || currentFrame}
          onReselect={handleReselect}
          onContinueAnyway={handleContinueAnyway}
        />
      )}

      {/* Frame indicator */}
      <div className="absolute bottom-16 right-4 rounded bg-black/70 px-2 py-1 text-xs text-white">
        Frame {currentFrame}
      </div>
    </div>
  );
}
