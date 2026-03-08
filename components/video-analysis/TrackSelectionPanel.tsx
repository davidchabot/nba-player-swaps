"use client";

import React from "react";
import { Users } from "lucide-react";
import { Track } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrackCard } from "./TrackCard";

interface TrackSelectionPanelProps {
  tracks: Track[];
  selectedTrackId: string | null;
  onTrackSelect: (trackId: string) => void;
  currentFrame: number;
  minQualityScore?: number;
}

export function TrackSelectionPanel({
  tracks,
  selectedTrackId,
  onTrackSelect,
  currentFrame,
  minQualityScore = 0.3,
}: TrackSelectionPanelProps) {
  // Sort tracks by quality score (best first)
  const sortedTracks = [...tracks].sort(
    (a, b) => b.quality.score - a.quality.score
  );

  // Split into primary (good quality) and secondary (lower quality)
  const primaryTracks = sortedTracks.filter(
    (t) => t.quality.score >= minQualityScore
  );
  const secondaryTracks = sortedTracks.filter(
    (t) => t.quality.score < minQualityScore
  );

  // Check if track is visible at current frame
  const isTrackActiveAtFrame = (track: Track, frame: number): boolean => {
    if (frame < track.frameRange[0] || frame > track.frameRange[1]) {
      return false;
    }
    // Check if there's a detection near this frame
    const detection = track.detections.find(
      (d) => Math.abs(d.frameNumber - frame) <= 2
    );
    return !!detection;
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Detected Players</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Tap a player in the video or select from the list below
        </p>
        {tracks.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {tracks.length} player{tracks.length !== 1 ? "s" : ""} detected
          </p>
        )}
      </div>

      {/* Track list */}
      <ScrollArea className="flex-1 p-4">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-sm font-medium text-foreground">
              No players detected
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try uploading a video with visible players
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Primary tracks (good quality) */}
            {primaryTracks.map((track) => (
              <TrackCard
                key={track.trackId}
                track={track}
                isSelected={track.trackId === selectedTrackId}
                isActive={isTrackActiveAtFrame(track, currentFrame)}
                onClick={() => onTrackSelect(track.trackId)}
                currentFrame={currentFrame}
              />
            ))}

            {/* Secondary tracks (lower quality) */}
            {secondaryTracks.length > 0 && (
              <>
                <div className="my-4 flex items-center gap-2">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground">
                    Lower quality
                  </span>
                  <div className="flex-1 border-t border-border" />
                </div>

                {secondaryTracks.map((track) => (
                  <TrackCard
                    key={track.trackId}
                    track={track}
                    isSelected={track.trackId === selectedTrackId}
                    isActive={isTrackActiveAtFrame(track, currentFrame)}
                    onClick={() => onTrackSelect(track.trackId)}
                    currentFrame={currentFrame}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer with selection status */}
      {selectedTrackId && (
        <div className="border-t border-border p-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <p className="text-xs font-medium text-primary">
              Player selected
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click "Start Replacement" to begin
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
