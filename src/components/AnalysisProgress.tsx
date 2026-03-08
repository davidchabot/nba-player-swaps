import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Scan, Users, BarChart3, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/context/AppContext";
import { simulateAnalysis, ANALYSIS_STAGE_LABELS } from "@/lib/mock-data";
import { AnalysisJob } from "@/types";

const STAGE_ICONS: Record<string, React.ReactNode> = {
  pending: <Scan className="w-5 h-5" />,
  scene_detection: <Scan className="w-5 h-5" />,
  tracking: <Users className="w-5 h-5" />,
  quality_scoring: <BarChart3 className="w-5 h-5" />,
  completed: <CheckCircle2 className="w-5 h-5" />,
};

const STAGES: AnalysisJob["status"][] = [
  "scene_detection",
  "tracking",
  "quality_scoring",
  "completed",
];

export default function AnalysisProgress() {
  const { setTracks, setCurrentStep, videoClip } = useApp();
  const [job, setJob] = useState<AnalysisJob | null>(null);

  useEffect(() => {
    const cleanup = simulateAnalysis(
      (j) => setJob(j),
      (j) => {
        setJob(j);
        if (j.result) {
          setTracks(j.result.tracks);
          setTimeout(() => setCurrentStep("select-player"), 1200);
        }
      }
    );
    return cleanup;
  }, [setTracks, setCurrentStep]);

  const overallProgress = job
    ? (() => {
        const stageIndex = STAGES.indexOf(job.status);
        if (stageIndex === -1) return 0;
        const base = (stageIndex / STAGES.length) * 100;
        const stageContribution = (job.progress / 100) * (100 / STAGES.length);
        return Math.min(base + stageContribution, 100);
      })()
    : 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 court-pattern">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <span className="text-xs font-mono text-accent font-bold tracking-wider uppercase">Analyzing</span>
          <h2 className="font-display text-3xl font-bold mt-2">Detecting Players</h2>
          <p className="text-muted-foreground mt-2">
            {videoClip ? `Processing ${videoClip.filename}` : "Processing video..."}
          </p>
        </div>

        <div className="glass rounded-2xl p-6 space-y-6">
          {/* Overall progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-mono text-foreground">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Stage list */}
          <div className="space-y-3">
            {STAGES.map((stage, i) => {
              const currentIndex = job ? STAGES.indexOf(job.status) : -1;
              const isActive = job?.status === stage;
              const isDone = currentIndex > i;
              const isPending = currentIndex < i;

              return (
                <motion.div
                  key={stage}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-accent/10 border border-accent/20"
                      : isDone
                      ? "bg-success/5 border border-success/10"
                      : "bg-secondary/30"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isActive
                        ? "bg-accent/20 text-accent"
                        : isDone
                        ? "bg-success/20 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : STAGE_ICONS[stage]}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        isPending ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {ANALYSIS_STAGE_LABELS[stage]}
                    </p>
                    {isActive && job && (
                      <div className="mt-1">
                        <Progress value={job.progress} className="h-1" />
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse-glow" />
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Animated scanning visual */}
          <div className="relative h-32 rounded-xl overflow-hidden bg-secondary/30">
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-20 h-20 rounded-full border-2 border-dashed border-accent/30"
              />
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute w-10 h-10 rounded-full bg-accent/10"
              />
              <Users className="absolute w-6 h-6 text-accent" />
            </div>
            <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent animate-scan-line" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
