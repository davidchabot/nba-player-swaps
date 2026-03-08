import { motion } from "framer-motion";
import { useApp, AppStep } from "@/context/AppContext";
import { Flame } from "lucide-react";

const STEPS: { key: AppStep; label: string }[] = [
  { key: "avatar", label: "Avatar" },
  { key: "upload", label: "Upload" },
  { key: "analyzing", label: "Analyze" },
  { key: "select-player", label: "Select" },
  { key: "replacing", label: "Replace" },
  { key: "result", label: "Result" },
];

const STEP_ORDER: AppStep[] = STEPS.map((s) => s.key);

export default function TopNav() {
  const { currentStep } = useApp();

  if (currentStep === "landing") return null;

  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 inset-x-0 z-50 glass"
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 mr-4">
          <Flame className="w-5 h-5 text-primary" />
          <span className="font-display font-bold text-sm hidden sm:inline">NBA AI Swap</span>
        </div>

        <div className="flex-1 flex items-center gap-1">
          {STEPS.map((step, i) => {
            const isActive = currentStep === step.key;
            const isDone = currentIndex > i;

            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-mono transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isDone
                        ? "bg-success/20 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span
                    className={`text-[10px] mt-1 hidden sm:block ${
                      isActive ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`h-px flex-1 mx-1 transition-colors ${
                      isDone ? "bg-success/30" : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
