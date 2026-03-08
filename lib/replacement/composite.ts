import { createPrediction, waitForPrediction } from "../analysis/replicate-client";
import { FramePose } from "./pose";

export interface CompositeOptions {
  shadowStrength?: number;
  colorMatchStrength?: number;
  blendMode?: "normal" | "soft" | "hard";
}

export interface CompositeResult {
  videoUrl: string;
  previewFrameUrl?: string;
}

/**
 * Render 3D avatar with pose and composite onto inpainted video
 */
export async function renderAndCompositeAvatar(
  avatarModelUrl: string,
  inpaintedVideoUrl: string,
  poses: FramePose[],
  originalVideoUrl: string,
  options: CompositeOptions = {},
  onProgress?: (progress: number) => void
): Promise<CompositeResult> {
  const {
    shadowStrength = 0.5,
    colorMatchStrength = 0.7,
    blendMode = "normal",
  } = options;

  try {
    // Step 1: Render avatar animation based on poses
    if (onProgress) onProgress(10);

    const renderedAvatarUrl = await renderAvatarWithPoses(
      avatarModelUrl,
      poses,
      (p) => onProgress && onProgress(10 + p * 0.4)
    );

    // Step 2: Composite rendered avatar onto inpainted video
    if (onProgress) onProgress(50);

    const compositedVideoUrl = await compositeVideos(
      inpaintedVideoUrl,
      renderedAvatarUrl,
      {
        shadowStrength,
        colorMatchStrength,
        blendMode,
      },
      (p) => onProgress && onProgress(50 + p * 0.5)
    );

    return {
      videoUrl: compositedVideoUrl,
    };
  } catch (error) {
    console.error("Composite error:", error);
    throw error;
  }
}

/**
 * Render GLB avatar model with pose sequence
 */
async function renderAvatarWithPoses(
  avatarModelUrl: string,
  poses: FramePose[],
  onProgress?: (progress: number) => void
): Promise<string> {
  // Convert poses to animation data
  const animationData = poses.map((pose) => ({
    frame: pose.frameNumber,
    joints: pose.keypoints.reduce((acc, kp) => {
      acc[kp.name] = { x: kp.x, y: kp.y, z: kp.z || 0 };
      return acc;
    }, {} as Record<string, { x: number; y: number; z: number }>),
  }));

  // Use a 3D rendering service or local Three.js
  // For now, use Replicate model for avatar rendering
  const prediction = await createPrediction(
    "cjwbw/3d-avatar-render:latest",
    {
      model_url: avatarModelUrl,
      animation: JSON.stringify(animationData),
      output_format: "mp4",
      fps: 30,
      width: 1920,
      height: 1080,
      background: "transparent",
    }
  );

  let completed = false;
  let result: unknown = null;

  while (!completed) {
    const status = await waitForPrediction(prediction.id, 10000);

    if (status.status === "succeeded") {
      completed = true;
      result = status.output;
    } else if (status.status === "failed") {
      throw new Error(`Avatar rendering failed: ${status.error}`);
    }

    if (onProgress && status.logs) {
      const progressMatch = status.logs.match(/(\d+)%/);
      if (progressMatch) {
        onProgress(parseInt(progressMatch[1]));
      }
    }
  }

  if (typeof result === "string") {
    return result;
  }

  throw new Error("Invalid avatar rendering result");
}

/**
 * Composite two videos together with blending
 */
async function compositeVideos(
  backgroundVideoUrl: string,
  foregroundVideoUrl: string,
  options: CompositeOptions,
  onProgress?: (progress: number) => void
): Promise<string> {
  // Use video compositing model
  const prediction = await createPrediction(
    "cjwbw/video-composite:latest",
    {
      background: backgroundVideoUrl,
      foreground: foregroundVideoUrl,
      blend_mode: options.blendMode || "normal",
      shadow_strength: options.shadowStrength || 0.5,
      color_match: options.colorMatchStrength || 0.7,
    }
  );

  let completed = false;
  let result: unknown = null;

  while (!completed) {
    const status = await waitForPrediction(prediction.id, 10000);

    if (status.status === "succeeded") {
      completed = true;
      result = status.output;
    } else if (status.status === "failed") {
      throw new Error(`Video compositing failed: ${status.error}`);
    }

    if (onProgress) {
      onProgress(50);
    }
  }

  if (typeof result === "string") {
    return result;
  }

  throw new Error("Invalid compositing result");
}

/**
 * Simple frame-by-frame compositing using FFmpeg via Replicate
 */
export async function compositeWithFFmpeg(
  backgroundVideoUrl: string,
  foregroundVideoUrl: string,
  maskVideoUrl: string
): Promise<string> {
  const prediction = await createPrediction(
    "andreasjansson/ffmpeg:latest",
    {
      inputs: [
        { url: backgroundVideoUrl, name: "bg.mp4" },
        { url: foregroundVideoUrl, name: "fg.mp4" },
        { url: maskVideoUrl, name: "mask.mp4" },
      ],
      command: "-i bg.mp4 -i fg.mp4 -i mask.mp4 -filter_complex \"[1:v][2:v]alphamerge[fg_alpha];[0:v][fg_alpha]overlay=0:0\" -c:v libx264 -preset fast output.mp4",
    }
  );

  const status = await waitForPrediction(prediction.id, 120000);

  if (status.status === "succeeded" && typeof status.output === "string") {
    return status.output;
  }

  throw new Error("FFmpeg compositing failed");
}

/**
 * Match colors between avatar and background
 */
export async function matchColors(
  avatarFrameUrl: string,
  backgroundFrameUrl: string
): Promise<string> {
  const prediction = await createPrediction(
    "cjwbw/color-match:latest",
    {
      source: avatarFrameUrl,
      reference: backgroundFrameUrl,
      strength: 0.7,
    }
  );

  const status = await waitForPrediction(prediction.id, 30000);

  if (status.status === "succeeded" && typeof status.output === "string") {
    return status.output;
  }

  return avatarFrameUrl; // Return original if matching fails
}

/**
 * Add realistic shadow under avatar
 */
export async function addShadow(
  frameUrl: string,
  avatarMaskUrl: string,
  lightDirection: { x: number; y: number } = { x: 0.3, y: 1 }
): Promise<string> {
  // Shadow generation based on mask and light direction
  const prediction = await createPrediction(
    "cjwbw/shadow-gen:latest",
    {
      image: frameUrl,
      mask: avatarMaskUrl,
      light_x: lightDirection.x,
      light_y: lightDirection.y,
      shadow_opacity: 0.4,
      shadow_blur: 10,
    }
  );

  const status = await waitForPrediction(prediction.id, 30000);

  if (status.status === "succeeded" && typeof status.output === "string") {
    return status.output;
  }

  return frameUrl;
}
