import { useState } from "react";
import { motion } from "framer-motion";
import { User, Shield, Eye, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { PlayerTrack } from "@/types";

function QualityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "text-success" : pct >= 60 ? "text-primary" : "text-destructive";
  return (
    <span className={`font-mono text-sm font-bold ${color}`}>{pct}%</span>
  );
}

function TrackCard({
  track,
  index,
  selected,
  onSelect,
}: {
  track: PlayerTrack;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl transition-all ${
        selected
          ? "bg-primary/10 border-2 border-primary glow-primary"
          : "bg-secondary/40 border border-border hover:border-primary/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center ${
            selected ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          <User className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-semibold">Player {index + 1}</h4>
            <QualityBadge score={track.qualityScore} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Track #{track.trackId} · Frames {track.frameRange[0]}–{track.frameRange[1]}
          </p>

          {/* Quality metrics */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              { icon: Eye, label: "Coverage", value: track.coverage },
              { icon: Shield, label: "Stability", value: track.stability },
              { icon: Zap, label: "Sharpness", value: track.sharpness },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-mono ml-auto">{Math.round(value * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function PlayerSelection() {
  const { tracks, selectedTrackId, setSelectedTrackId, setCurrentStep, videoClip, avatar } = useApp();
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);

  const sortedTracks = [...tracks].sort((a, b) => b.qualityScore - a.qualityScore);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row court-pattern">
      {/* Video area with bounding boxes */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="relative w-full max-w-2xl aspect-video rounded-2xl overflow-hidden bg-secondary/30 border border-border">
          {videoClip?.url ? (
            <video src={videoClip.url} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-muted-foreground">Video Preview</p>
            </div>
          )}

          {/* Overlay bounding boxes */}
          {sortedTracks.map((track, i) => {
            const box = track.boundingBoxes[0];
            if (!box) return null;
            const isSelected = selectedTrackId === track.trackId;
            const isHovered = hoveredTrack === track.trackId;

            return (
              <motion.div
                key={track.trackId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className={`absolute border-2 rounded cursor-pointer transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : isHovered
                    ? "border-accent bg-accent/10"
                    : "border-muted-foreground/30 bg-transparent"
                }`}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
                onClick={() => setSelectedTrackId(track.trackId)}
                onMouseEnter={() => setHoveredTrack(track.trackId)}
                onMouseLeave={() => setHoveredTrack(null)}
              >
                <span
                  className={`absolute -top-5 left-0 text-xs font-mono px-1.5 py-0.5 rounded ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  P{i + 1}
                </span>
              </motion.div>
            );
          })}

          {/* Avatar thumbnail */}
          {avatar && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2 glass rounded-lg px-3 py-2">
              <img
                src={avatar.thumbnailUrl}
                alt="Avatar"
                className="w-8 h-8 rounded-full object-cover border border-primary/30"
              />
              <span className="text-xs font-medium">{avatar.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Track selection panel */}
      <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-border bg-card/50 p-6 overflow-y-auto">
        <div className="mb-6">
          <h3 className="font-display text-xl font-bold">Select Player</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {tracks.length} players detected · Choose who to replace
          </p>
        </div>

        <div className="space-y-3">
          {sortedTracks.map((track, i) => (
            <TrackCard
              key={track.trackId}
              track={track}
              index={i}
              selected={selectedTrackId === track.trackId}
              onSelect={() => setSelectedTrackId(track.trackId)}
            />
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <Button
            onClick={() => setCurrentStep("replacing")}
            disabled={!selectedTrackId}
            className="w-full glow-primary"
            size="lg"
          >
            Start Replacement <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCurrentStep("upload")}
            className="w-full text-muted-foreground"
          >
            ← Back
          </Button>
        </div>
      </div>
    </div>
  );
}
