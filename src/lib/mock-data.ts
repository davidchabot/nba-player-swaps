import { Avatar, VideoClip, PlayerTrack, AnalysisJob, ReplacementJob, Project, ReplacementStage } from "@/types";

// Mock avatars
export const mockAvatars: Avatar[] = [
  {
    id: "av-1",
    name: "My Avatar",
    sourceImageUrl: "",
    thumbnailUrl: "",
    createdAt: new Date("2024-01-15"),
  },
];

// Mock player tracks (detected players in video)
export const mockTracks: PlayerTrack[] = [
  {
    trackId: "track-1",
    qualityScore: 0.93,
    coverage: 0.87,
    stability: 0.95,
    sharpness: 0.91,
    occlusion: 0.12,
    keyframes: [],
    frameRange: [0, 890],
    boundingBoxes: [
      { frame: 0, x: 0.3, y: 0.2, width: 0.15, height: 0.6 },
      { frame: 100, x: 0.35, y: 0.18, width: 0.14, height: 0.62 },
      { frame: 200, x: 0.45, y: 0.22, width: 0.15, height: 0.58 },
    ],
  },
  {
    trackId: "track-2",
    qualityScore: 0.78,
    coverage: 0.72,
    stability: 0.82,
    sharpness: 0.85,
    occlusion: 0.25,
    keyframes: [],
    frameRange: [30, 860],
    boundingBoxes: [
      { frame: 30, x: 0.6, y: 0.25, width: 0.13, height: 0.55 },
      { frame: 150, x: 0.55, y: 0.2, width: 0.14, height: 0.6 },
    ],
  },
  {
    trackId: "track-3",
    qualityScore: 0.65,
    coverage: 0.55,
    stability: 0.7,
    sharpness: 0.72,
    occlusion: 0.4,
    keyframes: [],
    frameRange: [100, 750],
    boundingBoxes: [
      { frame: 100, x: 0.15, y: 0.3, width: 0.12, height: 0.5 },
    ],
  },
  {
    trackId: "track-4",
    qualityScore: 0.52,
    coverage: 0.4,
    stability: 0.6,
    sharpness: 0.65,
    occlusion: 0.55,
    keyframes: [],
    frameRange: [200, 600],
    boundingBoxes: [
      { frame: 200, x: 0.78, y: 0.28, width: 0.11, height: 0.52 },
    ],
  },
];

// Simulate analysis progress
export function simulateAnalysis(
  onProgress: (job: AnalysisJob) => void,
  onComplete: (job: AnalysisJob) => void
) {
  const stages: AnalysisJob["status"][] = [
    "pending",
    "scene_detection",
    "tracking",
    "quality_scoring",
    "completed",
  ];

  let currentStage = 0;
  let progress = 0;

  const interval = setInterval(() => {
    progress += Math.random() * 8 + 2;

    if (progress >= 100 && currentStage < stages.length - 1) {
      currentStage++;
      progress = currentStage === stages.length - 1 ? 100 : 0;
    }

    const job: AnalysisJob = {
      id: "analysis-1",
      videoClipId: "clip-1",
      status: stages[currentStage],
      progress: Math.min(progress, 100),
      result:
        stages[currentStage] === "completed"
          ? { tracks: mockTracks, sceneCount: 3, totalFrames: 900 }
          : undefined,
    };

    onProgress(job);

    if (stages[currentStage] === "completed") {
      clearInterval(interval);
      onComplete(job);
    }
  }, 500);

  return () => clearInterval(interval);
}

// Simulate replacement pipeline
export function simulateReplacement(
  onProgress: (job: ReplacementJob) => void,
  onComplete: (job: ReplacementJob) => void
) {
  const stages: ReplacementStage[] = [
    "pending",
    "pose_extraction",
    "segmentation",
    "rendering",
    "inpainting",
    "compositing",
    "encoding",
    "completed",
  ];

  let currentStage = 0;
  let progress = 0;

  const interval = setInterval(() => {
    progress += Math.random() * 6 + 1;

    if (progress >= 100 && currentStage < stages.length - 1) {
      currentStage++;
      progress = currentStage === stages.length - 1 ? 100 : 0;
    }

    const job: ReplacementJob = {
      id: "replacement-1",
      videoClipId: "clip-1",
      trackId: "track-1",
      avatarId: "av-1",
      status: stages[currentStage],
      progress: Math.min(progress, 100),
      outputStoragePath:
        stages[currentStage] === "completed" ? "/output/final.mp4" : undefined,
    };

    onProgress(job);

    if (stages[currentStage] === "completed") {
      clearInterval(interval);
      onComplete(job);
    }
  }, 600);

  return () => clearInterval(interval);
}

export const REPLACEMENT_STAGE_LABELS: Record<ReplacementStage, string> = {
  pending: "Initializing...",
  pose_extraction: "Extracting Poses",
  segmentation: "Segmenting Player",
  rendering: "Rendering Avatar",
  inpainting: "Inpainting Occlusions",
  compositing: "Compositing Video",
  encoding: "Encoding Final Video",
  completed: "Complete!",
  failed: "Failed",
};

export const ANALYSIS_STAGE_LABELS: Record<AnalysisJob["status"], string> = {
  pending: "Initializing...",
  scene_detection: "Detecting Scenes",
  tracking: "Tracking Players",
  quality_scoring: "Scoring Quality",
  completed: "Analysis Complete!",
  failed: "Analysis Failed",
};
