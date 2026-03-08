import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bone, Scissors, Paintbrush, Layers, Film, CheckCircle2, Cpu } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/context/AppContext";
import { simulateReplacement, REPLACEMENT_STAGE_LABELS } from "@/lib/mock-data";
import { ReplacementJob, ReplacementStage } from "@/types";

const STAGE_ICONS: Record<ReplacementStage, React.ReactNode> = {
  pending: <Cpu className="w-4 h-4" />,
  pose_extraction: <Bone className="w-4 h-4" />,
  segmentation: <Scissors className="w-4 h-4" />,
  rendering: <Paintbrush className="w-4 h-4" />,
  inpainting: <Paintbrush className="w-4 h-4" />,
  compositing: <Layers className="w-4 h-4" />,
  encoding: <Film className="w-4 h-4" />,
  completed: <CheckCircle2 className="w-4 h-4" />,
  failed: <Cpu className="w-4 h-4" />,
};

const PIPELINE_STAGES: ReplacementStage[] = [
  "pose_extraction",
  "segmentation",
  "rendering",
  "inpainting",
  "compositing",
  "encoding",
  "completed",
];

export default function ReplacementProgress() {
  const { setCurrentStep } = useApp();
  const [job, setJob] = useState<ReplacementJob | null>(null);

  useEffect(() => {
    const cleanup = simulateReplacement(
      (j) => setJob(j),
      (j) => {
        setJob(j);
        setTimeout(() => setCurrentStep("result"), 1500);
      }
    );
    return cleanup;
  }, [setCurrentStep]);

  const overallProgress = job
    ? (() => {
        const stageIndex = PIPELINE_STAGES.indexOf(job.status);
        if (stageIndex === -1) return 0;
        const base = (stageIndex / PIPELINE_STAGES.length) * 100;
        const contrib = (job.progress / 100) * (100 / PIPELINE_STAGES.length);
        return Math.min(base + contrib, 100);
      })()
    : 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 court-pattern">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/5 blur-[140px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <span className="text-xs font-mono text-primary font-bold tracking-wider uppercase">Processing</span>
          <h2 className="font-display text-3xl font-bold mt-2">Replacing Player</h2>
          <p className="text-muted-foreground mt-2">AI is swapping the body frame by frame</p>
        </div>

        <div className="glass rounded-2xl p-6 space-y-6">
          {/* Overall */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-mono text-foreground">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Pipeline stages */}
          <div className="space-y-2">
            {PIPELINE_STAGES.map((stage, i) => {
              const currentIndex = job ? PIPELINE_STAGES.indexOf(job.status) : -1;
              const isActive = job?.status === stage;
              const isDone = currentIndex > i;

              return (
                <motion.div
                  key={stage}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary/10 border border-primary/20"
                      : isDone
                      ? "bg-success/5"
                      : "bg-secondary/20"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      isActive
                        ? "bg-primary/20 text-primary"
                        : isDone
                        ? "bg-success/20 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : STAGE_ICONS[stage]}
                  </div>
                  <span
                    className={`text-sm flex-1 ${
                      isActive ? "text-foreground font-medium" : isDone ? "text-muted-foreground" : "text-muted-foreground/60"
                    }`}
                  >
                    {REPLACEMENT_STAGE_LABELS[stage]}
                  </span>
                  {isActive && (
                    <span className="text-xs font-mono text-primary">
                      {Math.round(job?.progress || 0)}%
                    </span>
                  )}
                  {isDone && <span className="text-xs text-success">✓</span>}
                </motion.div>
              );
            })}
          </div>

          {/* Animated visual */}
          <div className="relative h-24 rounded-xl overflow-hidden bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5">
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ scale: [0.95, 1.05, 0.95] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="font-display text-lg font-bold gradient-text"
              >
                {job ? REPLACEMENT_STAGE_LABELS[job.status] : "Starting..."}
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
