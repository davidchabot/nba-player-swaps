"use client";

import React from "react";
import { AlertCircle, MousePointer, SkipForward } from "lucide-react";

interface LostTargetPromptProps {
  trackId: string;
  lostAtFrame: number;
  onReselect: () => void;
  onContinueAnyway: () => void;
}

export function LostTargetPrompt({
  trackId,
  lostAtFrame,
  onReselect,
  onContinueAnyway,
}: LostTargetPromptProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="max-w-sm rounded-xl bg-card p-6 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
          <AlertCircle className="h-7 w-7 text-amber-500" />
        </div>

        <h3 className="mt-4 text-lg font-semibold text-foreground">
          Lost Target
        </h3>

        <p className="mt-2 text-sm text-muted-foreground">
          Player {trackId.slice(0, 4)} is no longer visible in the video.
          This can happen during fast cuts, screens, or heavy occlusion.
        </p>

        <p className="mt-2 text-xs text-muted-foreground">
          Lost at frame {lostAtFrame}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={onReselect}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <MousePointer className="h-4 w-4" />
            Tap to Reselect
          </button>

          <button
            onClick={onContinueAnyway}
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipForward className="h-4 w-4" />
            Continue with partial track
          </button>
        </div>

        <p className="mt-4 text-[10px] text-muted-foreground">
          Tip: Selecting a player with higher stability score may give better results
        </p>
      </div>
    </div>
  );
}
