import { extractPosesForTrack, FramePose } from "./pose";
import { segmentPlayerInVideo, SegmentationMask } from "./segment";
import { inpaintVideoWithMask, InpaintResult } from "./inpaint";
import { renderAndCompositeAvatar, CompositeResult } from "./composite";
import { Track } from "../types";

export type ReplacementStep =
  | "pending"
  | "pose_extraction"
  | "segmentation"
  | "inpainting"
  | "rendering"
  | "compositing"
  | "completed"
  | "failed";

export interface ReplacementProgress {
  step: ReplacementStep;
  progress: number; // 0-100
  message: string;
}

export interface ReplacementPipelineResult {
  outputVideoUrl: string;
  previewFrameUrl?: string;
  poses: FramePose[];
  masks: SegmentationMask[];
}

export interface ReplacementPipelineOptions {
  quality: "draft" | "standard" | "high";
  avatarModelUrl: string;
  videoUrl: string;
  track: Track;
  fps: number;
  onProgress?: (progress: ReplacementProgress) => void;
}

/**
 * Run the full avatar replacement pipeline
 *
 * Steps:
 * 1. Extract poses from selected track
 * 2. Segment player using SAM 2
 * 3. Inpaint background using ProPainter
 * 4. Render avatar with extracted poses
 * 5. Composite avatar onto inpainted video
 */
export async function runReplacementPipeline(
  options: ReplacementPipelineOptions
): Promise<ReplacementPipelineResult> {
  const { avatarModelUrl, videoUrl, track, fps, onProgress } = options;

  const updateProgress = (step: ReplacementStep, progress: number, message: string) => {
    if (onProgress) {
      onProgress({ step, progress, message });
    }
  };

  try {
    // Step 1: Pose Extraction
    updateProgress("pose_extraction", 0, "Extracting poses from video...");

    const poses = await extractPosesForTrack(
      videoUrl,
      track.detections,
      fps,
      (p) => updateProgress("pose_extraction", p, `Extracting poses: ${Math.round(p)}%`)
    );

    updateProgress("pose_extraction", 100, "Pose extraction complete");

    // Step 2: Segmentation
    updateProgress("segmentation", 0, "Segmenting player from video...");

    const masks = await segmentPlayerInVideo(
      videoUrl,
      track.detections,
      (p) => updateProgress("segmentation", p, `Segmenting: ${Math.round(p)}%`)
    );

    updateProgress("segmentation", 100, "Segmentation complete");

    // Get mask video URL (combine individual masks or use video mask)
    const maskVideoUrl = getMaskVideoUrl(masks);

    // Step 3: Inpainting
    updateProgress("inpainting", 0, "Removing player and filling background...");

    const inpaintResult: InpaintResult = await inpaintVideoWithMask(
      videoUrl,
      maskVideoUrl,
      (p) => updateProgress("inpainting", p, `Inpainting: ${Math.round(p)}%`)
    );

    updateProgress("inpainting", 100, "Inpainting complete");

    // Step 4 & 5: Rendering and Compositing
    updateProgress("rendering", 0, "Rendering avatar...");

    const compositeResult: CompositeResult = await renderAndCompositeAvatar(
      avatarModelUrl,
      inpaintResult.videoUrl,
      poses,
      videoUrl,
      {
        shadowStrength: options.quality === "high" ? 0.6 : 0.4,
        colorMatchStrength: options.quality === "high" ? 0.8 : 0.6,
        blendMode: "normal",
      },
      (p) => {
        if (p < 50) {
          updateProgress("rendering", p * 2, `Rendering avatar: ${Math.round(p * 2)}%`);
        } else {
          updateProgress("compositing", (p - 50) * 2, `Compositing: ${Math.round((p - 50) * 2)}%`);
        }
      }
    );

    updateProgress("completed", 100, "Replacement complete!");

    return {
      outputVideoUrl: compositeResult.videoUrl,
      previewFrameUrl: compositeResult.previewFrameUrl,
      poses,
      masks,
    };
  } catch (error) {
    updateProgress("failed", 0, `Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    throw error;
  }
}

/**
 * Get mask video URL from individual masks
 * If masks are already a video URL, return it
 * Otherwise, combine into video
 */
function getMaskVideoUrl(masks: SegmentationMask[]): string {
  // If first mask URL looks like a video, return it
  if (masks.length > 0 && masks[0].maskUrl.endsWith(".mp4")) {
    return masks[0].maskUrl;
  }

  // If masks are individual frames, we need to combine them
  // For now, return the first mask URL and let the inpainting handle it
  // In production, you'd use FFmpeg to combine frames into video
  if (masks.length > 0) {
    return masks[0].maskUrl;
  }

  throw new Error("No masks available for inpainting");
}

/**
 * Simplified pipeline for draft quality (faster, lower quality)
 */
export async function runDraftPipeline(
  options: ReplacementPipelineOptions
): Promise<ReplacementPipelineResult> {
  // Use fewer frames and lower resolution for draft
  const simplifiedTrack = {
    ...options.track,
    detections: options.track.detections.filter((_, i) => i % 3 === 0), // Every 3rd frame
  };

  return runReplacementPipeline({
    ...options,
    track: simplifiedTrack,
  });
}

/**
 * Preview a single frame replacement
 */
export async function previewSingleFrame(
  avatarModelUrl: string,
  videoUrl: string,
  track: Track,
  frameNumber: number
): Promise<string> {
  // Find detection closest to requested frame
  const detection = track.detections.reduce((closest, d) => {
    if (!closest) return d;
    return Math.abs(d.frameNumber - frameNumber) < Math.abs(closest.frameNumber - frameNumber) ? d : closest;
  }, track.detections[0]);

  if (!detection) {
    throw new Error("No detection found for frame");
  }

  // Quick preview without full pipeline
  // Just segment and composite a single frame
  const { segmentSingleFrame } = await import("./segment");
  const { inpaintFrame } = await import("./inpaint");

  // Extract frame from video (would need frame extraction)
  const frameUrl = `${videoUrl}#t=${frameNumber / 30}`;

  // Segment
  const maskUrl = await segmentSingleFrame(frameUrl, detection.boundingBox);

  // Inpaint
  const inpaintedUrl = await inpaintFrame(frameUrl, maskUrl);

  // For preview, just return inpainted frame
  // Full avatar rendering would be done in the actual pipeline
  return inpaintedUrl;
}
