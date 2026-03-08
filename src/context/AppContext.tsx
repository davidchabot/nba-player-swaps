import React, { createContext, useContext, useState, useCallback } from "react";
import { Avatar, VideoClip, AnalysisJob, ReplacementJob, PlayerTrack } from "@/types";

interface AppState {
  avatar: Avatar | null;
  setAvatar: (avatar: Avatar | null) => void;
  avatarDbId: string | null;
  setAvatarDbId: (id: string | null) => void;

  videoClip: VideoClip | null;
  setVideoClip: (clip: VideoClip | null) => void;
  videoFile: File | null;
  setVideoFile: (file: File | null) => void;
  videoDbId: string | null;
  setVideoDbId: (id: string | null) => void;
  videoPublicUrl: string | null;
  setVideoPublicUrl: (url: string | null) => void;

  analysisJob: AnalysisJob | null;
  setAnalysisJob: (job: AnalysisJob | null) => void;
  analysisJobId: string | null;
  setAnalysisJobId: (id: string | null) => void;
  tracks: PlayerTrack[];
  setTracks: (tracks: PlayerTrack[]) => void;

  selectedTrackId: string | null;
  setSelectedTrackId: (id: string | null) => void;

  replacementJob: ReplacementJob | null;
  setReplacementJob: (job: ReplacementJob | null) => void;
  replacementJobId: string | null;
  setReplacementJobId: (id: string | null) => void;
  outputVideoUrl: string | null;
  setOutputVideoUrl: (url: string | null) => void;

  currentStep: AppStep;
  setCurrentStep: (step: AppStep) => void;

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
  const [avatarDbId, setAvatarDbId] = useState<string | null>(null);
  const [videoClip, setVideoClip] = useState<VideoClip | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDbId, setVideoDbId] = useState<string | null>(null);
  const [videoPublicUrl, setVideoPublicUrl] = useState<string | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [replacementJob, setReplacementJob] = useState<ReplacementJob | null>(null);
  const [replacementJobId, setReplacementJobId] = useState<string | null>(null);
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>("landing");

  const resetAll = useCallback(() => {
    setAvatar(null);
    setAvatarDbId(null);
    setVideoClip(null);
    setVideoFile(null);
    setVideoDbId(null);
    setVideoPublicUrl(null);
    setAnalysisJob(null);
    setAnalysisJobId(null);
    setTracks([]);
    setSelectedTrackId(null);
    setReplacementJob(null);
    setReplacementJobId(null);
    setOutputVideoUrl(null);
    setCurrentStep("landing");
  }, []);

  return (
    <AppContext.Provider
      value={{
        avatar, setAvatar,
        avatarDbId, setAvatarDbId,
        videoClip, setVideoClip,
        videoFile, setVideoFile,
        videoDbId, setVideoDbId,
        videoPublicUrl, setVideoPublicUrl,
        analysisJob, setAnalysisJob,
        analysisJobId, setAnalysisJobId,
        tracks, setTracks,
        selectedTrackId, setSelectedTrackId,
        replacementJob, setReplacementJob,
        replacementJobId, setReplacementJobId,
        outputVideoUrl, setOutputVideoUrl,
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
