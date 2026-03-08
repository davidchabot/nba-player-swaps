import { useApp } from "@/context/AppContext";
import LandingPage from "@/components/LandingPage";
import AvatarCreation from "@/components/AvatarCreation";
import VideoUpload from "@/components/VideoUpload";
import AnalysisProgress from "@/components/AnalysisProgress";
import PlayerSelection from "@/components/PlayerSelection";
import ReplacementProgress from "@/components/ReplacementProgress";
import ResultPage from "@/components/ResultPage";
import TopNav from "@/components/TopNav";

const Index = () => {
  const { currentStep } = useApp();

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className={currentStep !== "landing" ? "pt-16" : ""}>
        {currentStep === "landing" && <LandingPage />}
        {currentStep === "avatar" && <AvatarCreation />}
        {currentStep === "upload" && <VideoUpload />}
        {currentStep === "analyzing" && <AnalysisProgress />}
        {currentStep === "select-player" && <PlayerSelection />}
        {currentStep === "replacing" && <ReplacementProgress />}
        {currentStep === "result" && <ResultPage />}
      </div>
    </div>
  );
};

export default Index;
