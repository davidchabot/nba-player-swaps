/**
 * Track quality scoring
 * Computes quality metrics to help users select the best player to swap
 */

import { Track, TrackQuality, VideoSegment } from '@/lib/types';

/**
 * Compute quality metrics for a track
 * Higher scores = better candidates for avatar replacement
 */
export function computeTrackQuality(
  track: Track,
  segment: VideoSegment,
  allTracks: Track[]
): TrackQuality {
  const totalSegmentFrames = segment.frameEnd - segment.frameStart + 1;
  const trackFrames = track.detections.length;

  // 1. Coverage: What percentage of segment frames have this track visible
  const coverage = trackFrames / totalSegmentFrames;

  // 2. Average box area (larger = easier to swap)
  const avgBoxArea = track.detections.reduce((sum, d) => {
    return sum + (d.boundingBox.width * d.boundingBox.height);
  }, 0) / trackFrames;

  // 3. Stability: How smooth is the bounding box movement
  const stability = computeStability(track);

  // 4. Occlusion rate: How often does this track overlap with others
  const occlusionRate = computeOcclusionRate(track, allTracks);

  // 5. Sharpness: Estimate based on bounding box consistency
  // (Real sharpness would require frame analysis)
  const sharpness = estimateSharpness(track);

  // Compute weighted overall score
  // Weights chosen to prioritize:
  // - High coverage (we can swap more frames)
  // - Low occlusion (cleaner swaps)
  // - High stability (smoother result)
  const score =
    coverage * 0.25 +
    Math.min(avgBoxArea * 20, 0.2) + // Cap area contribution at 0.2
    stability * 0.25 +
    (1 - occlusionRate) * 0.15 +
    sharpness * 0.15;

  return {
    score: Math.min(1, Math.max(0, score)), // Clamp to 0-1
    coverageFrames: trackFrames,
    avgBoxArea: avgBoxArea * 100, // Convert to percentage of frame
    stability,
    occlusionRate,
    sharpness,
  };
}

/**
 * Compute stability score based on bounding box movement
 * High stability = smooth, predictable movement
 * Low stability = jittery, erratic boxes
 */
function computeStability(track: Track): number {
  if (track.detections.length < 3) {
    return 0.5; // Not enough data
  }

  const velocities: number[] = [];

  for (let i = 1; i < track.detections.length; i++) {
    const prev = track.detections[i - 1];
    const curr = track.detections[i];

    // Calculate center point velocity
    const prevCenterX = prev.boundingBox.x + prev.boundingBox.width / 2;
    const prevCenterY = prev.boundingBox.y + prev.boundingBox.height / 2;
    const currCenterX = curr.boundingBox.x + curr.boundingBox.width / 2;
    const currCenterY = curr.boundingBox.y + curr.boundingBox.height / 2;

    const velocity = Math.sqrt(
      Math.pow(currCenterX - prevCenterX, 2) +
      Math.pow(currCenterY - prevCenterY, 2)
    );
    velocities.push(velocity);
  }

  // Calculate velocity variance
  const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const variance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length;

  // Lower variance = more stable
  // Convert to 0-1 scale (empirically tuned)
  const stability = Math.exp(-variance * 100);

  return Math.min(1, Math.max(0, stability));
}

/**
 * Compute occlusion rate: how often this track overlaps with others
 */
function computeOcclusionRate(track: Track, allTracks: Track[]): number {
  if (track.detections.length === 0) return 0;

  let occludedFrames = 0;

  for (const detection of track.detections) {
    // Check if any other track overlaps at this frame
    for (const otherTrack of allTracks) {
      if (otherTrack.trackId === track.trackId) continue;

      const otherDetection = otherTrack.detections.find(
        d => d.frameNumber === detection.frameNumber
      );

      if (otherDetection) {
        const iou = calculateIoU(detection.boundingBox, otherDetection.boundingBox);
        if (iou > 0.1) {
          occludedFrames++;
          break; // Count each frame only once
        }
      }
    }
  }

  return occludedFrames / track.detections.length;
}

/**
 * Calculate IoU between two boxes
 */
function calculateIoU(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const union = area1 + area2 - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Estimate sharpness based on bounding box characteristics
 * This is a proxy - real sharpness requires frame pixel analysis
 */
function estimateSharpness(track: Track): number {
  if (track.detections.length === 0) return 0;

  // Proxy metrics for sharpness:
  // 1. Consistent box size (not rapidly changing)
  // 2. High confidence scores

  const confidences = track.detections.map(d => d.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  // Box size consistency
  const areas = track.detections.map(d => d.boundingBox.width * d.boundingBox.height);
  const avgArea = areas.reduce((a, b) => a + b, 0) / areas.length;
  const areaVariance = areas.reduce((sum, a) => sum + Math.pow(a - avgArea, 2), 0) / areas.length;
  const sizeConsistency = Math.exp(-areaVariance * 1000);

  // Combine metrics
  return (avgConfidence * 0.6 + sizeConsistency * 0.4);
}

/**
 * Filter tracks to only show good candidates
 */
export function filterQualityTracks(
  tracks: Track[],
  options: {
    minScore?: number;
    minCoverage?: number;
    maxOcclusion?: number;
    topN?: number;
  } = {}
): Track[] {
  const {
    minScore = 0.3,
    minCoverage = 0.2,
    maxOcclusion = 0.8,
    topN = 10,
  } = options;

  return tracks
    .filter(t =>
      t.quality.score >= minScore &&
      t.quality.coverageFrames > 0 &&
      (t.quality.coverageFrames / (t.frameRange[1] - t.frameRange[0] + 1)) >= minCoverage &&
      t.quality.occlusionRate <= maxOcclusion
    )
    .sort((a, b) => b.quality.score - a.quality.score)
    .slice(0, topN);
}

/**
 * Detect when a track is "lost" (confidence drops or gaps in detections)
 */
export function detectTrackLoss(track: Track): number | undefined {
  if (track.detections.length < 2) return undefined;

  const confidenceThreshold = 0.4;
  const maxGap = 5; // frames

  for (let i = 1; i < track.detections.length; i++) {
    const prev = track.detections[i - 1];
    const curr = track.detections[i];

    // Check for large gaps
    if (curr.frameNumber - prev.frameNumber > maxGap) {
      return prev.frameNumber;
    }

    // Check for sudden confidence drop
    if (curr.confidence < confidenceThreshold && prev.confidence >= confidenceThreshold) {
      return curr.frameNumber;
    }
  }

  return undefined;
}
