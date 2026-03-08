/**
 * Person detection using Hugging Face Inference API
 * Uses YOLOS model for object detection with fallback options
 */

export interface Detection {
  label: string;
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

export interface PersonDetection {
  id: string;
  label: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Models to try in order (fallback chain)
const DETECTION_MODELS = [
  'hustvl/yolos-tiny',
  'facebook/detr-resnet-101',
  'hustvl/yolos-small',
];

/**
 * Detect persons in an image using Hugging Face Inference API
 */
export async function detectPersonsInImage(
  imageBuffer: Buffer,
  options: { minConfidence?: number; retries?: number } = {}
): Promise<PersonDetection[]> {
  const { minConfidence = 0.3, retries = 2 } = options;

  const apiKey = process.env.HUGGINGFACE_API_KEY;

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let lastError: Error | null = null;

  // Try each model in the fallback chain
  for (const model of DETECTION_MODELS) {
    const apiUrl = `https://api-inference.huggingface.co/models/${model}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`Trying model ${model}, attempt ${attempt + 1}...`);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: imageBuffer,
        });

        if (response.status === 503) {
          // Model is loading, wait and retry
          const waitTime = attempt * 10 + 10; // 10s, 20s, 30s
          console.log(`Model ${model} is loading, waiting ${waitTime}s...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
          continue;
        }

        if (response.status === 410 || response.status === 404) {
          // Model not available, try next model
          console.log(`Model ${model} not available (${response.status}), trying next...`);
          break;
        }

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const detections: Detection[] = await response.json();
        console.log(`Got ${detections.length} detections from ${model}`);

        // Filter for persons only and above confidence threshold
        const persons: PersonDetection[] = detections
          .filter((d) => d.label === 'person' && d.score >= minConfidence)
          .map((d, index) => ({
            id: `person-${index + 1}`,
            label: `Person ${index + 1}`,
            confidence: d.score,
            boundingBox: {
              x: d.box.xmin,
              y: d.box.ymin,
              width: d.box.xmax - d.box.xmin,
              height: d.box.ymax - d.box.ymin,
            },
          }));

        console.log(`Found ${persons.length} persons`);
        return persons;

      } catch (error) {
        console.error(`Detection error with ${model}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }

  // All models failed
  throw lastError || new Error('All detection models failed');
}

/**
 * Detect persons across multiple frames and consolidate results
 */
export async function detectPersonsInFrames(
  frameBuffers: Buffer[],
  options: { minConfidence?: number } = {}
): Promise<PersonDetection[]> {
  const allDetections: PersonDetection[][] = [];

  for (let i = 0; i < frameBuffers.length; i++) {
    try {
      const detections = await detectPersonsInImage(frameBuffers[i], options);
      allDetections.push(detections);

      // Delay between requests
      if (i < frameBuffers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Error processing frame ${i}:`, error);
      allDetections.push([]);
    }
  }

  // Find frame with best detections
  let bestFrameDetections: PersonDetection[] = [];
  let bestTotalConfidence = 0;

  for (const frameDetections of allDetections) {
    const totalConfidence = frameDetections.reduce((sum, d) => sum + d.confidence, 0);
    if (frameDetections.length >= bestFrameDetections.length && totalConfidence > bestTotalConfidence) {
      bestFrameDetections = frameDetections;
      bestTotalConfidence = totalConfidence;
    }
  }

  return bestFrameDetections.map((d, index) => ({
    ...d,
    id: `person-${index + 1}`,
    label: `Person ${index + 1}`,
  }));
}

/**
 * Simple IoU calculation for bounding boxes
 */
export function calculateIoU(
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
