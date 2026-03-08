"use client";

import React from "react";
import { AlertCircle, Check } from "lucide-react";
import { Track } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TrackCardProps {
  track: Track;
  isSelected: boolean;
  isActive: boolean;
  onClick: () => void;
  currentFrame?: number;
}

export function TrackCard({
  track,
  isSelected,
  isActive,
  onClick,
  currentFrame,
}: TrackCardProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const qualityColor = (score: number): string => {
    if (score >= 0.7) return "text-green-500";
    if (score >= 0.5) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-all",
        isSelected
          ? "border-primary bg-primary/10 ring-2 ring-primary"
          : "border-border hover:bg-muted",
        !isActive && "opacity-60"
      )}
    >
      {/* Thumbnails row (3 thumbnails) */}
      <div className="mb-3 flex gap-2">
        {track.keyframes.length > 0 ? (
          track.keyframes.map((keyframe, index) => (
            <div
              key={`${keyframe.type}-${index}`}
              className="relative h-16 w-12 overflow-hidden rounded bg-muted"
            >
              {keyframe.thumbUrl ? (
                <img
                  src={keyframe.thumbUrl}
                  alt={keyframe.type}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  F{keyframe.frame}
                </div>
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 text-[7px] text-white text-center truncate">
                {keyframe.type.replace("_", " ")}
              </span>
            </div>
          ))
        ) : (
          // Placeholder thumbnails
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 w-12 rounded bg-muted flex items-center justify-center"
            >
              <span className="text-xs text-muted-foreground">-</span>
            </div>
          ))
        )}
      </div>

      {/* Track info */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          Player {track.trackId.slice(0, 4)}
        </span>
        <div className="flex items-center gap-1">
          {isSelected && <Check className="h-3 w-3 text-primary" />}
          <span
            className={cn(
              "text-xs font-medium",
              qualityColor(track.quality.score)
            )}
          >
            {Math.round(track.quality.score * 100)}%
          </span>
        </div>
      </div>

      {/* Quality metrics */}
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>
          Coverage: {Math.round((track.quality.coverageFrames / (track.frameRange[1] - track.frameRange[0] + 1)) * 100)}%
        </span>
        <span>Stability: {Math.round(track.quality.stability * 100)}%</span>
        <span>
          Occlusion: {Math.round(track.quality.occlusionRate * 100)}%
        </span>
        <span>Sharpness: {Math.round(track.quality.sharpness * 100)}%</span>
      </div>

      {/* Frame range */}
      <div className="mt-2 text-[10px] text-muted-foreground">
        Frames {track.frameRange[0]} - {track.frameRange[1]}
      </div>

      {/* Lost indicator */}
      {track.lostAtFrame !== undefined && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-500">
          <AlertCircle className="h-3 w-3" />
          <span>
            Lost at frame {track.lostAtFrame}
          </span>
        </div>
      )}
    </button>
  );
}
