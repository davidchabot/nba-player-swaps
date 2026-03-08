import { motion } from "framer-motion";
import { Download, RotateCcw, Share2, Trophy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";

export default function ResultPage() {
  const { avatar, videoClip, resetAll, setCurrentStep } = useApp();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 court-pattern">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-2xl"
      >
        {/* Celebration */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-8"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20 mb-4"
          >
            <Trophy className="w-4 h-4 text-success" />
            <span className="text-sm font-medium text-success">Swap Complete!</span>
          </motion.div>
          <h2 className="font-display text-4xl font-bold">
            <span className="gradient-text">Your Video</span> is Ready
          </h2>
          <p className="text-muted-foreground mt-2">
            AI successfully replaced the player with your avatar
          </p>
        </motion.div>

        <div className="glass rounded-2xl p-6 space-y-6">
          {/* Video result */}
          <div className="relative aspect-video rounded-xl overflow-hidden bg-secondary/30 border border-border">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Sparkles className="w-10 h-10 text-primary animate-pulse-glow" />
              <p className="text-sm text-muted-foreground">
                {videoClip ? `${videoClip.filename} — Processed` : "Output video"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                (Connect AI services to generate real output)
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Avatar", value: avatar?.name || "—" },
              { label: "Duration", value: videoClip ? `${videoClip.durationSeconds.toFixed(1)}s` : "—" },
              { label: "Resolution", value: videoClip?.resolution || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-display font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="flex-1 glow-primary">
              <Download className="w-4 h-4 mr-2" />
              Download Video
            </Button>
            <Button variant="outline" size="lg" className="flex-1">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              resetAll();
              setCurrentStep("landing");
            }}
            className="w-full text-muted-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-2" /> Start New Project
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
