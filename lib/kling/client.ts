import jwt from 'jsonwebtoken';

const KLING_API_BASE = 'https://api.klingai.com';

/**
 * Generate JWT token for Kling AI API authentication
 */
function generateToken(): string {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error('Kling AI credentials not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30 minutes expiry
    nbf: now - 5, // Valid from 5 seconds ago
  };

  return jwt.sign(payload, secretKey, {
    algorithm: 'HS256',
    header: {
      alg: 'HS256',
      typ: 'JWT',
    },
  });
}

/**
 * Make authenticated request to Kling AI API
 */
async function klingRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const token = generateToken();

  const response = await fetch(`${KLING_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Kling API error:', data);
    throw new Error(data.message || `Kling API error: ${response.status}`);
  }

  return data;
}

export interface FaceSwapRequest {
  /** URL of the source video */
  videoUrl: string;
  /** URL of the face image to swap in */
  faceImageUrl: string;
  /** Optional: specific face index in video to swap (default: 0 for first detected face) */
  faceIndex?: number;
}

export interface FaceSwapResponse {
  taskId: string;
  status: string;
}

export interface TaskStatusResponse {
  taskId: string;
  status: 'submitted' | 'processing' | 'succeed' | 'failed';
  progress?: number;
  videoUrl?: string;
  errorMessage?: string;
}

/**
 * Start a face swap task
 * Uses Kling AI's face swap API to replace a face in video with provided face image
 */
export async function startFaceSwap(request: FaceSwapRequest): Promise<FaceSwapResponse> {
  const response = await klingRequest('/v1/videos/face-swap', {
    method: 'POST',
    body: JSON.stringify({
      video_url: request.videoUrl,
      face_image_url: request.faceImageUrl,
      face_index: request.faceIndex ?? 0,
    }),
  });

  return {
    taskId: response.data?.task_id || response.task_id,
    status: response.data?.task_status || response.status || 'submitted',
  };
}

/**
 * Get the status of a face swap task
 */
export async function getFaceSwapStatus(taskId: string): Promise<TaskStatusResponse> {
  const response = await klingRequest(`/v1/videos/face-swap/${taskId}`, {
    method: 'GET',
  });

  const data = response.data || response;

  return {
    taskId: data.task_id || taskId,
    status: data.task_status || data.status,
    progress: data.progress,
    videoUrl: data.task_result?.videos?.[0]?.url || data.video_url,
    errorMessage: data.task_status_msg || data.error_message,
  };
}

/**
 * Alternative: Use Image-to-Video with face reference for avatar animation
 * This generates a new video with the avatar face animated based on motion
 */
export async function startImage2Video(request: {
  imageUrl: string;
  prompt?: string;
  duration?: number;
  aspectRatio?: string;
}): Promise<FaceSwapResponse> {
  const response = await klingRequest('/v1/videos/image2video', {
    method: 'POST',
    body: JSON.stringify({
      image_url: request.imageUrl,
      prompt: request.prompt || 'a person playing basketball, smooth motion',
      duration: request.duration || 5,
      aspect_ratio: request.aspectRatio || '16:9',
      model: 'kling-v1',
    }),
  });

  return {
    taskId: response.data?.task_id || response.task_id,
    status: response.data?.task_status || response.status || 'submitted',
  };
}

/**
 * Get Image-to-Video task status
 */
export async function getImage2VideoStatus(taskId: string): Promise<TaskStatusResponse> {
  const response = await klingRequest(`/v1/videos/image2video/${taskId}`, {
    method: 'GET',
  });

  const data = response.data || response;

  return {
    taskId: data.task_id || taskId,
    status: data.task_status || data.status,
    progress: data.progress,
    videoUrl: data.task_result?.videos?.[0]?.url || data.video_url,
    errorMessage: data.task_status_msg || data.error_message,
  };
}
