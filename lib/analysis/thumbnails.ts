/**
 * Thumbnail extraction for tracks
 * Generates 3 best thumbnails per track:
 * 1. Best full-body frame (largest box, well-centered)
 * 2. Best torso-forward frame (frontal orientation)
 * 3. Least overlap frame (minimal occlusion)
 */

import { Track, TrackKeyframe, TrackDetection } from '@/lib/types';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export interface ThumbnailCandidate {
  detection: TrackDetection;
  score: number;
  type: TrackKeyframe['type'];
}

/**
 * Generate 3 thumbnails for a track
 */
export async function generateTrackThumbnails(
  track: Track,
  videoUrl: string,
  allTracks: Track[]
): Promise<TrackKeyframe[]> {
  const keyframes: TrackKeyframe[] = [];

  // Find best frames for each type
  const fullBodyCandidate = findBestFullBodyFrame(track);
  const torsoCandidate = findBestTorsoForwardFrame(track);
  const leastOverlapCandidate = findLeastOverlapFrame(track, allTracks);

  // Extract and upload thumbnails
  const candidates = [
    { candidate: fullBodyCandidate, type: 'full_body' as const },
    { candidate: torsoCandidate, type: 'torso_forward' as const },
    { candidate: leastOverlapCandidate, type: 'least_overlap' as const },
  ];

  for (const { candidate, type } of candidates) {
    if (!candidate) continue;

    try {
      // For now, we store the frame info without actually extracting
      // The actual extraction would happen via Replicate or ffmpeg
      // The frontend can use the video + timestamp to display

      keyframes.push({
        frame: candidate.detection.frameNumber,
        timestamp: candidate.detection.timestamp,
        bbox: [
          candidate.detection.boundingBox.x,
          candidate.detection.boundingBox.y,
          candidate.detection.boundingBox.width,
          candidate.detection.boundingBox.height,
        ],
        thumbUrl: '', // Will be populated when we extract frames
        type,
      });
    } catch (error) {
      console.error(`Error generating ${type} thumbnail:`, error);
    }
  }

  return keyframes;
}

/**
 * Find the best full-body frame
 * Criteria: largest bounding box, well-centered, high confidence
 */
function findBestFullBodyFrame(track: Track): ThumbnailCandidate | null {
  if (track.detections.length === 0) return null;

  let best: ThumbnailCandidate | null = null;

  for (const detection of track.detections) {
    const box = detection.boundingBox;

    // Score based on:
    // - Box area (larger = better)
    // - How centered the box is (0.5, 0.5 is center)
    // - Confidence
    const area = box.width * box.height;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const centerScore = 1 - (Math.abs(centerX - 0.5) + Math.abs(centerY - 0.5)) / 2;

    // Prefer taller boxes (full body vs partial)
    const aspectRatio = box.height / box.width;
    const aspectScore = Math.min(aspectRatio / 2, 1); // Prefer tall boxes up to 2:1

    const score =
      area * 0.4 +
      centerScore * 0.2 +
      detection.confidence * 0.2 +
      aspectScore * 0.2;

    if (!best || score > best.score) {
      best = { detection, score, type: 'full_body' };
    }
  }

  return best;
}

/**
 * Find the best torso-forward frame
 * Criteria: box proportions suggest frontal view, high confidence
 * Note: Without pose estimation, we estimate orientation from box shape
 */
function findBestTorsoForwardFrame(track: Track): ThumbnailCandidate | null {
  if (track.detections.length === 0) return null;

  let best: ThumbnailCandidate | null = null;

  for (const detection of track.detections) {
    const box = detection.boundingBox;

    // Frontal views tend to have:
    // - More symmetric box proportions
    // - Width-to-height ratio around 0.4-0.6 for upper body
    const aspectRatio = box.width / box.height;
    const frontalScore = 1 - Math.abs(aspectRatio - 0.5) * 2;

    // Larger boxes are usually clearer
    const area = box.width * box.height;

    const score =
      frontalScore * 0.4 +
      area * 0.3 +
      detection.confidence * 0.3;

    if (!best || score > best.score) {
      best = { detection, score, type: 'torso_forward' };
    }
  }

  return best;
}

/**
 * Find the frame with least overlap with other tracks
 * Criteria: lowest IoU with any other track at this frame
 */
function findLeastOverlapFrame(
  track: Track,
  allTracks: Track[]
): ThumbnailCandidate | null {
  if (track.detections.length === 0) return null;

  let best: ThumbnailCandidate | null = null;

  for (const detection of track.detections) {
    let maxIoU = 0;

    // Find maximum overlap with any other track at this frame
    for (const otherTrack of allTracks) {
      if (otherTrack.trackId === track.trackId) continue;

      const otherDetection = otherTrack.detections.find(
        d => d.frameNumber === detection.frameNumber
      );

      if (otherDetection) {
        const iou = calculateIoU(detection.boundingBox, otherDetection.boundingBox);
        maxIoU = Math.max(maxIoU, iou);
      }
    }

    // Score is inverse of overlap (less overlap = higher score)
    const overlapScore = 1 - maxIoU;
    const score =
      overlapScore * 0.5 +
      detection.confidence * 0.3 +
      (detection.boundingBox.width * detection.boundingBox.height) * 0.2;

    if (!best || score > best.score) {
      best = { detection, score, type: 'least_overlap' };
    }
  }

  return best;
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
 * Extract a frame from video at a specific timestamp
 * Uses canvas in browser or Replicate/ffmpeg on server
 */
export async function extractFrameAsImage(
  videoUrl: string,
  timestamp: number,
  bbox?: { x: number; y: number; width: number; height: number }
): Promise<Buffer> {
  // This would be implemented using:
  // 1. Replicate model for frame extraction
  // 2. Or ffmpeg command on server
  // 3. Or canvas-based extraction if running client-side

  // For now, return empty buffer as placeholder
  console.log(`Would extract frame at ${timestamp}s from ${videoUrl}`);

  return Buffer.from([]);
}

/**
 * Upload thumbnail to Supabase storage
 */
export async function uploadThumbnail(
  trackId: string,
  type: TrackKeyframe['type'],
  imageBuffer: Buffer
): Promise<string> {
  const filename = `${trackId}/${type}-${uuidv4()}.jpg`;

  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKETS.THUMBNAILS)
    .upload(filename, imageBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload thumbnail: ${error.message}`);
  }

  return getPublicUrl(STORAGE_BUCKETS.THUMBNAILS, filename);
}
