// Shared types for the NBA Avatar Swap application

export interface ScannedAvatar {
  id: string;
  name: string;
  thumbnail: string;
}

export interface DetectedPlayer {
  id: string;
  name: string;
  number: string;
  team: string;
  confidence: number;
}

export interface DetectedPerson {
  id: string;
  label: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  thumbnailUrl: string | null;
}

export interface VideoClip {
  id: string;
  filename: string;
  url: string;
  durationSeconds: number | null;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  createdAt: string;
}

export interface DetectionJob {
  id: string;
  videoClipId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  persons?: DetectedPerson[];
}

export interface Avatar {
  id: string;
  name: string;
  sourceImageUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

// API Request/Response types

export interface UploadVideoResponse {
  id: string;
  url: string;
  filename: string;
}

export interface ExtractFramesResponse {
  frameCount: number;
  frameUrls: string[];
}

export interface StartDetectionResponse {
  jobId: string;
  status: string;
}

export interface DetectionStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  persons: DetectedPerson[];
}

export interface CreateAvatarResponse {
  id: string;
  name: string;
  thumbnailUrl: string | null;
}

// ===== Video Analysis Types =====

export interface VideoInput {
  width: number;
  height: number;
  fps: number;
  duration_s: number;
}

export interface VideoSegment {
  segmentId: string;
  frameStart: number;
  frameEnd: number;
  startTime: number;
  endTime: number;
  cutConfidence: number;
}

export interface TrackQuality {
  score: number;           // 0-1 overall weighted score
  coverageFrames: number;  // Total frames where track is visible
  avgBoxArea: number;      // Average bounding box area
  stability: number;       // 0-1 smoothness of movement
  occlusionRate: number;   // 0-1 rate of occlusion
  sharpness: number;       // 0-1 average sharpness
}

export interface TrackKeyframe {
  frame: number;
  timestamp: number;
  bbox: [number, number, number, number]; // [x, y, width, height] normalized 0-1
  thumbUrl: string;
  type: 'full_body' | 'torso_forward' | 'least_overlap';
}

export interface TrackDetection {
  frameNumber: number;
  timestamp: number;
  boundingBox: {
    x: number;      // Normalized 0-1
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface Track {
  trackId: string;
  segmentId: string;
  frameRange: [number, number];
  quality: TrackQuality;
  keyframes: TrackKeyframe[];
  detections: TrackDetection[];
  isActive: boolean;
  lostAtFrame?: number;
}

export interface VideoAnalysisUIDefaults {
  showTracksMinScore: number;
  highlightTopN: number;
  allowClickOnVideo: boolean;
  allowClickOnTrackList: boolean;
}

export interface VideoAnalysisResult {
  clipId: string;
  input: VideoInput;
  segments: VideoSegment[];
  tracks: Track[];
  uiDefaults: VideoAnalysisUIDefaults;
}

export interface AnalysisJob {
  id: string;
  videoClipId: string;
  status: 'pending' | 'scene_detection' | 'tracking' | 'quality_scoring' | 'thumbnail_generation' | 'completed' | 'failed';
  progress: number;
  currentStep: string | null;
  result: VideoAnalysisResult | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ===== Replacement Pipeline Types =====

export interface ReplacementJob {
  id: string;
  videoClipId: string;
  trackId: string;
  avatarId: string;
  status: 'pending' | 'pose_extraction' | 'segmentation' | 'rendering' | 'inpainting' | 'compositing' | 'encoding' | 'completed' | 'failed';
  progress: number;
  currentStep: string | null;
  previewUrl: string | null;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ===== API Response Types =====

export interface StartAnalysisResponse {
  jobId: string;
  status: string;
  estimatedTime?: number;
}

export interface AnalysisStatusResponse {
  jobId: string;
  status: AnalysisJob['status'];
  progress: number;
  currentStep: string | null;
  result?: VideoAnalysisResult;
  errorMessage?: string;
}

export interface StartReplacementResponse {
  jobId: string;
  status: string;
  estimatedTime?: number;
}

export interface ReplacementStatusResponse {
  jobId: string;
  status: ReplacementJob['status'];
  progress: number;
  currentStep: string | null;
  previewUrl?: string;
  outputUrl?: string;
  errorMessage?: string;
}
