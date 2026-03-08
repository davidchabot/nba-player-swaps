import { motion } from "framer-motion";
import { Flame, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";

export default function LandingPage() {
  const { setCurrentStep } = useApp();

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden court-pattern">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center px-6 max-w-3xl"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
        >
          <Flame className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-muted-foreground">AI-Powered Body Swap</span>
        </motion.div>

        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-6">
          <span className="gradient-text">NBA AI</span>
          <br />
          <span className="text-foreground">Avatar Swap</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
          Upload any basketball video, create your avatar, and watch AI replace a player's body with yours — frame by frame.
        </p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            size="lg"
            className="glow-primary text-lg px-8 py-6 font-display font-semibold"
            onClick={() => setCurrentStep("avatar")}
          >
            Get Started
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="text-lg px-8 py-6 font-display"
            onClick={() => setCurrentStep("avatar")}
          >
            How It Works
          </Button>
        </motion.div>

        {/* Steps preview */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto"
        >
          {[
            { step: "01", title: "Create Avatar", desc: "Upload your photo" },
            { step: "02", title: "Upload Video", desc: "Any basketball clip" },
            { step: "03", title: "AI Swap", desc: "Watch the magic" },
          ].map((item) => (
            <div key={item.step} className="glass rounded-xl p-4 text-left">
              <span className="text-xs font-mono text-primary font-bold">{item.step}</span>
              <h3 className="font-display font-semibold text-foreground mt-1">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
