import { createPrediction, waitForPrediction } from "../analysis/replicate-client";

export interface InpaintResult {
  videoUrl: string;
  frameUrls?: string[];
}

/**
 * Inpaint video to remove player and fill background
 * Uses ProPainter for video inpainting
 */
export async function inpaintVideoWithMask(
  videoUrl: string,
  maskVideoUrl: string,
  onProgress?: (progress: number) => void
): Promise<InpaintResult> {
  try {
    // ProPainter for video inpainting
    const prediction = await createPrediction(
      "sczhou/propainter:latest",
      {
        video: videoUrl,
        mask: maskVideoUrl,
        // ProPainter settings for best quality
        fp16: true,
        // Use neighboring frames for better temporal consistency
        neighbor_length: 10,
        ref_stride: 10,
        // Output settings
        resize_ratio: 1.0,
      }
    );

    // Poll for completion
    let completed = false;
    let result: unknown = null;

    while (!completed) {
      const status = await waitForPrediction(prediction.id, 10000);

      if (status.status === "succeeded") {
        completed = true;
        result = status.output;
      } else if (status.status === "failed") {
        throw new Error(`ProPainter inpainting failed: ${status.error}`);
      }

      if (onProgress && status.logs) {
        const progressMatch = status.logs.match(/(\d+)%/);
        if (progressMatch) {
          onProgress(parseInt(progressMatch[1]));
        }
      }
    }

    if (result && typeof result === "string") {
      return { videoUrl: result };
    }

    if (result && typeof result === "object" && "video" in result) {
      return { videoUrl: (result as { video: string }).video };
    }

    throw new Error("Invalid inpainting result");
  } catch (error) {
    console.error("ProPainter inpainting error:", error);
    throw error;
  }
}

/**
 * Inpaint a single frame (for preview or fallback)
 */
export async function inpaintFrame(
  imageUrl: string,
  maskUrl: string
): Promise<string> {
  const prediction = await createPrediction(
    "stability-ai/stable-diffusion-inpainting:latest",
    {
      image: imageUrl,
      mask: maskUrl,
      prompt: "basketball court, crowd, clean background, high quality",
      negative_prompt: "person, player, athlete, human",
      num_inference_steps: 25,
      guidance_scale: 7.5,
    }
  );

  const status = await waitForPrediction(prediction.id, 60000);

  if (status.status === "succeeded" && status.output) {
    if (Array.isArray(status.output) && status.output.length > 0) {
      return status.output[0];
    }
    if (typeof status.output === "string") {
      return status.output;
    }
  }

  throw new Error("Frame inpainting failed");
}

/**
 * Alternative: Use E2FGVI for video inpainting
 * Good for object removal with flow-guided propagation
 */
export async function inpaintVideoE2FGVI(
  videoUrl: string,
  maskVideoUrl: string,
  onProgress?: (progress: number) => void
): Promise<InpaintResult> {
  try {
    const prediction = await createPrediction(
      "andreasjansson/e2fgvi:latest",
      {
        video: videoUrl,
        mask: maskVideoUrl,
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
        throw new Error(`E2FGVI inpainting failed: ${status.error}`);
      }

      if (onProgress) {
        onProgress(50); // E2FGVI doesn't provide detailed progress
      }
    }

    if (result && typeof result === "string") {
      return { videoUrl: result };
    }

    throw new Error("Invalid E2FGVI result");
  } catch (error) {
    console.error("E2FGVI inpainting error:", error);
    throw error;
  }
}
