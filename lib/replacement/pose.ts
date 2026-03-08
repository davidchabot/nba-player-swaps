import { runModel } from "../analysis/replicate-client";

export interface PoseKeypoint {
  x: number;
  y: number;
  z?: number;
  visibility: number;
  name: string;
}

export interface FramePose {
  frameNumber: number;
  keypoints: PoseKeypoint[];
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PoseExtractionResult {
  trackId: string;
  poses: FramePose[];
  fps: number;
}

/**
 * Extract poses from video frames for a specific track
 * Uses MediaPipe Pose via Replicate
 */
export async function extractPosesForTrack(
  videoUrl: string,
  trackDetections: Array<{
    frameNumber: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>,
  fps: number,
  onProgress?: (progress: number) => void
): Promise<FramePose[]> {
  const poses: FramePose[] = [];
  const totalFrames = trackDetections.length;

  // Process in batches for efficiency
  const batchSize = 10;
  for (let i = 0; i < trackDetections.length; i += batchSize) {
    const batch = trackDetections.slice(i, i + batchSize);

    // For each detection, extract pose from the bounding box region
    const batchPromises = batch.map(async (detection) => {
      try {
        // Use MediaPipe pose estimation
        // Note: In production, you'd crop the frame to bounding box first
        const result = await runModel(
          "google-ai-edge/mediapipe-pose-landmark:latest",
          {
            video: videoUrl,
            frame_number: detection.frameNumber,
            bbox: [
              detection.boundingBox.x,
              detection.boundingBox.y,
              detection.boundingBox.width,
              detection.boundingBox.height,
            ],
          }
        );

        if (result && Array.isArray(result.landmarks)) {
          return {
            frameNumber: detection.frameNumber,
            keypoints: result.landmarks.map((lm: { x: number; y: number; z?: number; visibility: number }, idx: number) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility,
              name: POSE_LANDMARK_NAMES[idx] || `landmark_${idx}`,
            })),
            boundingBox: detection.boundingBox,
          };
        }
        return null;
      } catch (error) {
        console.error(`Pose extraction failed for frame ${detection.frameNumber}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    poses.push(...batchResults.filter((p): p is FramePose => p !== null));

    if (onProgress) {
      onProgress(Math.min(100, ((i + batchSize) / totalFrames) * 100));
    }
  }

  // Interpolate missing poses
  return interpolateMissingPoses(poses, trackDetections);
}

/**
 * Interpolate missing poses for smooth animation
 */
function interpolateMissingPoses(
  poses: FramePose[],
  allDetections: Array<{ frameNumber: number; boundingBox: { x: number; y: number; width: number; height: number } }>
): FramePose[] {
  const poseMap = new Map(poses.map((p) => [p.frameNumber, p]));
  const result: FramePose[] = [];

  for (const detection of allDetections) {
    const existing = poseMap.get(detection.frameNumber);
    if (existing) {
      result.push(existing);
    } else {
      // Find nearest poses for interpolation
      const before = poses.filter((p) => p.frameNumber < detection.frameNumber).pop();
      const after = poses.find((p) => p.frameNumber > detection.frameNumber);

      if (before && after) {
        // Linear interpolation
        const t = (detection.frameNumber - before.frameNumber) / (after.frameNumber - before.frameNumber);
        result.push(interpolatePose(before, after, t, detection.frameNumber, detection.boundingBox));
      } else if (before) {
        result.push({ ...before, frameNumber: detection.frameNumber, boundingBox: detection.boundingBox });
      } else if (after) {
        result.push({ ...after, frameNumber: detection.frameNumber, boundingBox: detection.boundingBox });
      }
    }
  }

  return result;
}

function interpolatePose(
  a: FramePose,
  b: FramePose,
  t: number,
  frameNumber: number,
  boundingBox: { x: number; y: number; width: number; height: number }
): FramePose {
  return {
    frameNumber,
    boundingBox,
    keypoints: a.keypoints.map((kpA, i) => {
      const kpB = b.keypoints[i];
      return {
        x: kpA.x + (kpB.x - kpA.x) * t,
        y: kpA.y + (kpB.y - kpA.y) * t,
        z: kpA.z !== undefined && kpB.z !== undefined ? kpA.z + (kpB.z - kpA.z) * t : undefined,
        visibility: kpA.visibility + (kpB.visibility - kpA.visibility) * t,
        name: kpA.name,
      };
    }),
  };
}

// MediaPipe pose landmark names
const POSE_LANDMARK_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
];
