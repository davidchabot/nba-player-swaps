/**
 * Video Analysis Pipeline
 * Orchestrates scene detection, tracking, quality scoring, and thumbnail generation
 */

export * from './scene-detection';
export * from './tracking';
export * from './quality';
export * from './thumbnails';
export * from './replicate-client';

import {
  VideoAnalysisResult,
  VideoSegment,
  Track,
  VideoInput,
} from '@/lib/types';
import { detectSceneCuts, cutsToSegments, getVideoMetadata } from './scene-detection';
import { trackPersonsInSegment, mergeTracksAcrossSegments } from './tracking';
import { computeTrackQuality, detectTrackLoss, filterQualityTracks } from './quality';
import { generateTrackThumbnails } from './thumbnails';

export interface AnalysisPipelineOptions {
  // Scene detection
  cutThreshold?: number;
  minSceneLength?: number;

  // Tracking
  confidenceThreshold?: number;
  trackThreshold?: number;
  minTrackLength?: number;
  lostBuffer?: number;

  // Quality filtering
  minQualityScore?: number;
  maxTracks?: number;

  // Callbacks for progress updates
  onProgress?: (step: string, progress: number) => void;
}

/**
 * Run the full analysis pipeline on a video
 */
export async function runAnalysisPipeline(
  videoUrl: string,
  clipId: string,
  options: AnalysisPipelineOptions = {}
): Promise<VideoAnalysisResult> {
  const {
    cutThreshold = 0.3,
    minSceneLength = 15,
    confidenceThreshold = 0.35,
    trackThreshold = 0.6,
    minTrackLength = 15,
    lostBuffer = 20,
    minQualityScore = 0.3,
    maxTracks = 10,
    onProgress,
  } = options;

  onProgress?.('metadata', 0);

  // Step 1: Get video metadata
  const metadata = await getVideoMetadata(videoUrl);
  const input: VideoInput = {
    width: metadata.width,
    height: metadata.height,
    fps: metadata.fps,
    duration_s: metadata.duration,
  };

  onProgress?.('scene_detection', 10);

  // Step 2: Detect scene cuts
  const cuts = await detectSceneCuts(videoUrl, {
    threshold: cutThreshold,
    minSceneLength,
    fps: metadata.fps,
  });

  // Convert cuts to segments
  const segments = cutsToSegments(
    cuts,
    metadata.totalFrames,
    metadata.fps,
    metadata.duration
  );

  console.log(`Detected ${segments.length} segments`);

  onProgress?.('tracking', 30);

  // Step 3: Run tracking on each segment
  const segmentTracks = new Map<string, Track[]>();

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const progress = 30 + (i / segments.length) * 40;
    onProgress?.('tracking', progress);

    const tracks = await trackPersonsInSegment(
      videoUrl,
      segment,
      metadata.width,
      metadata.height,
      {
        confidenceThreshold,
        trackThreshold,
        minTrackLength,
        lostBuffer,
      }
    );

    segmentTracks.set(segment.segmentId, tracks);
  }

  // Merge tracks across segments (optional)
  let allTracks = mergeTracksAcrossSegments(segmentTracks);

  onProgress?.('quality_scoring', 70);

  // Step 4: Compute quality scores
  for (const track of allTracks) {
    const segment = segments.find(s => s.segmentId === track.segmentId);
    if (segment) {
      track.quality = computeTrackQuality(track, segment, allTracks);
      track.lostAtFrame = detectTrackLoss(track);
      track.isActive = track.lostAtFrame === undefined;
    }
  }

  // Filter to quality tracks
  allTracks = filterQualityTracks(allTracks, {
    minScore: minQualityScore,
    topN: maxTracks,
  });

  onProgress?.('thumbnail_generation', 85);

  // Step 5: Generate thumbnails
  for (const track of allTracks) {
    track.keyframes = await generateTrackThumbnails(track, videoUrl, allTracks);
  }

  onProgress?.('completed', 100);

  // Build final result
  const result: VideoAnalysisResult = {
    clipId,
    input,
    segments,
    tracks: allTracks,
    uiDefaults: {
      showTracksMinScore: minQualityScore,
      highlightTopN: Math.min(6, allTracks.length),
      allowClickOnVideo: true,
      allowClickOnTrackList: true,
    },
  };

  return result;
}
