import React, { createContext, useContext, useState, useCallback } from "react";
import { Avatar, VideoClip, AnalysisJob, ReplacementJob, PlayerTrack } from "@/types";

interface AppState {
  // Avatar
  avatar: Avatar | null;
  setAvatar: (avatar: Avatar | null) => void;

  // Video
  videoClip: VideoClip | null;
  setVideoClip: (clip: VideoClip | null) => void;
  videoFile: File | null;
  setVideoFile: (file: File | null) => void;

  // Analysis
  analysisJob: AnalysisJob | null;
  setAnalysisJob: (job: AnalysisJob | null) => void;
  tracks: PlayerTrack[];
  setTracks: (tracks: PlayerTrack[]) => void;

  // Selection
  selectedTrackId: string | null;
  setSelectedTrackId: (id: string | null) => void;

  // Replacement
  replacementJob: ReplacementJob | null;
  setReplacementJob: (job: ReplacementJob | null) => void;

  // Navigation
  currentStep: AppStep;
  setCurrentStep: (step: AppStep) => void;

  // Reset
  resetAll: () => void;
}

export type AppStep =
  | "landing"
  | "avatar"
  | "upload"
  | "analyzing"
  | "select-player"
  | "replacing"
  | "result";

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [videoClip, setVideoClip] = useState<VideoClip | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [replacementJob, setReplacementJob] = useState<ReplacementJob | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>("landing");

  const resetAll = useCallback(() => {
    setAvatar(null);
    setVideoClip(null);
    setVideoFile(null);
    setAnalysisJob(null);
    setTracks([]);
    setSelectedTrackId(null);
    setReplacementJob(null);
    setCurrentStep("landing");
  }, []);

  return (
    <AppContext.Provider
      value={{
        avatar, setAvatar,
        videoClip, setVideoClip,
        videoFile, setVideoFile,
        analysisJob, setAnalysisJob,
        tracks, setTracks,
        selectedTrackId, setSelectedTrackId,
        replacementJob, setReplacementJob,
        currentStep, setCurrentStep,
        resetAll,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
