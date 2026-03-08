import { runModel, createPrediction, waitForPrediction } from "../analysis/replicate-client";

export interface SegmentationMask {
  frameNumber: number;
  maskUrl: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SegmentationResult {
  trackId: string;
  masks: SegmentationMask[];
}

/**
 * Segment a player from video frames using SAM 2
 */
export async function segmentPlayerInVideo(
  videoUrl: string,
  trackDetections: Array<{
    frameNumber: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>,
  onProgress?: (progress: number) => void
): Promise<SegmentationMask[]> {
  // SAM 2 can track objects through video given initial prompts
  // We'll use the first bounding box as the initial prompt

  const firstDetection = trackDetections[0];
  if (!firstDetection) {
    throw new Error("No detections provided for segmentation");
  }

  try {
    // Use SAM 2 video segmentation
    // Initialize with bounding box prompt
    const prediction = await createPrediction(
      "meta/sam-2-video:latest",
      {
        video: videoUrl,
        // Bounding box format: [x1, y1, x2, y2] normalized
        box: [
          firstDetection.boundingBox.x,
          firstDetection.boundingBox.y,
          firstDetection.boundingBox.x + firstDetection.boundingBox.width,
          firstDetection.boundingBox.y + firstDetection.boundingBox.height,
        ],
        // Track ID for this object
        track_id: 0,
        // Output format
        output_type: "mask_video",
      }
    );

    // Poll for completion
    let completed = false;
    let result: unknown = null;

    while (!completed) {
      const status = await waitForPrediction(prediction.id, 5000);

      if (status.status === "succeeded") {
        completed = true;
        result = status.output;
      } else if (status.status === "failed") {
        throw new Error(`SAM 2 segmentation failed: ${status.error}`);
      }

      if (onProgress && status.logs) {
        // Parse progress from logs if available
        const progressMatch = status.logs.match(/(\d+)%/);
        if (progressMatch) {
          onProgress(parseInt(progressMatch[1]));
        }
      }
    }

    // Process results - SAM 2 returns mask video or frame masks
    if (result && typeof result === "object" && "masks" in result) {
      const masks = result as { masks: Array<{ frame: number; mask_url: string }> };
      return masks.masks.map((m) => {
        const detection = trackDetections.find((d) => d.frameNumber === m.frame) || firstDetection;
        return {
          frameNumber: m.frame,
          maskUrl: m.mask_url,
          boundingBox: detection.boundingBox,
        };
      });
    }

    // If result is a single mask video URL, we need to extract frames
    if (typeof result === "string") {
      return trackDetections.map((d) => ({
        frameNumber: d.frameNumber,
        maskUrl: result as string,
        boundingBox: d.boundingBox,
      }));
    }

    return [];
  } catch (error) {
    console.error("SAM 2 segmentation error:", error);
    throw error;
  }
}

/**
 * Segment a single frame using SAM (for thumbnail or preview)
 */
export async function segmentSingleFrame(
  imageUrl: string,
  boundingBox: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const result = await runModel(
    "meta/sam-2:latest",
    {
      image: imageUrl,
      box: [
        boundingBox.x,
        boundingBox.y,
        boundingBox.x + boundingBox.width,
        boundingBox.y + boundingBox.height,
      ],
      output_format: "png",
    }
  );

  if (result && typeof result === "string") {
    return result;
  }

  if (result && Array.isArray(result) && result.length > 0) {
    return result[0];
  }

  throw new Error("Failed to segment frame");
}

/**
 * Refine mask edges for better compositing
 */
export async function refineMaskEdges(
  maskUrl: string,
  originalImageUrl: string
): Promise<string> {
  // Use edge refinement model for cleaner masks
  const result = await runModel(
    "cjwbw/rembg:latest",
    {
      image: originalImageUrl,
      mask: maskUrl,
      alpha_matting: true,
      alpha_matting_foreground_threshold: 240,
      alpha_matting_background_threshold: 10,
      alpha_matting_erode_size: 10,
    }
  );

  if (result && typeof result === "string") {
    return result;
  }

  return maskUrl; // Return original if refinement fails
}
