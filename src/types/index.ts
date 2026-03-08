// Types for the NBA AI Avatar Swap app

export interface Avatar {
  id: string;
  name: string;
  sourceImageUrl: string;
  thumbnailUrl: string;
  createdAt: Date;
}

export interface VideoClip {
  id: string;
  filename: string;
  url: string;
  durationSeconds: number;
  fps: number;
  resolution: string;
  status: "uploaded" | "processing" | "ready";
  createdAt: Date;
}

export interface PlayerTrack {
  trackId: string;
  qualityScore: number;
  coverage: number;
  stability: number;
  sharpness: number;
  occlusion: number;
  keyframes: string[];
  frameRange: [number, number];
  boundingBoxes: BoundingBox[];
}

export interface BoundingBox {
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnalysisJob {
  id: string;
  videoClipId: string;
  status: "pending" | "scene_detection" | "tracking" | "quality_scoring" | "completed" | "failed";
  progress: number;
  result?: VideoAnalysisResult;
  errorMessage?: string;
}

export interface VideoAnalysisResult {
  tracks: PlayerTrack[];
  sceneCount: number;
  totalFrames: number;
}

export interface ReplacementJob {
  id: string;
  videoClipId: string;
  trackId: string;
  avatarId: string;
  status: ReplacementStage;
  progress: number;
  outputStoragePath?: string;
  errorMessage?: string;
}

export type ReplacementStage =
  | "pending"
  | "pose_extraction"
  | "segmentation"
  | "rendering"
  | "inpainting"
  | "compositing"
  | "encoding"
  | "completed"
  | "failed";

export interface Project {
  id: string;
  name: string;
  avatar?: Avatar;
  videoClip?: VideoClip;
  analysisJob?: AnalysisJob;
  replacementJob?: ReplacementJob;
  selectedTrackId?: string;
  createdAt: Date;
  updatedAt: Date;
}
