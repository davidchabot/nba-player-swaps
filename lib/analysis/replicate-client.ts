import Replicate from 'replicate';

let replicateClient: Replicate | null = null;

export function getReplicateClient(): Replicate {
  if (!replicateClient) {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN environment variable is not set');
    }
    replicateClient = new Replicate({ auth: apiToken });
  }
  return replicateClient;
}

/**
 * Run a Replicate model and wait for the result
 */
export async function runModel<T>(
  modelId: string,
  input: Record<string, unknown>
): Promise<T> {
  const replicate = getReplicateClient();

  console.log(`Running Replicate model: ${modelId}`);
  const output = await replicate.run(modelId as `${string}/${string}`, { input });

  return output as T;
}

export interface PredictionResult {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string;
  logs?: string;
}

/**
 * Create a prediction without waiting for completion
 * Use this for long-running models when you want to poll separately
 */
export async function createPrediction(
  modelId: string,
  input: Record<string, unknown>
): Promise<PredictionResult> {
  const replicate = getReplicateClient();

  // Parse model ID - handle versioned and unversioned model IDs
  const parts = modelId.split('/');
  const owner = parts[0];
  const nameWithVersion = parts[1] || '';
  const [name] = nameWithVersion.split(':');

  if (!owner || !name) {
    throw new Error(`Invalid model ID: ${modelId}`);
  }

  // Get the latest version of the model
  const model = await replicate.models.get(owner, name);
  const version = model.latest_version?.id;

  if (!version) {
    throw new Error(`No version found for model: ${modelId}`);
  }

  // Create prediction
  const prediction = await replicate.predictions.create({
    version,
    input,
  });

  return {
    id: prediction.id,
    status: prediction.status as PredictionResult['status'],
    output: prediction.output,
    error: prediction.error ?? undefined,
    logs: prediction.logs ?? undefined,
  };
}

/**
 * Wait for a prediction to complete
 */
export async function waitForPrediction(
  predictionId: string,
  timeoutMs: number = 300000 // 5 minutes default
): Promise<PredictionResult> {
  const replicate = getReplicateClient();
  const startTime = Date.now();

  while (true) {
    const prediction = await replicate.predictions.get(predictionId);

    if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
      return {
        id: prediction.id,
        status: prediction.status as PredictionResult['status'],
        output: prediction.output,
        error: prediction.error ?? undefined,
        logs: prediction.logs ?? undefined,
      };
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Prediction timed out after ${timeoutMs}ms`);
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Create a prediction and poll for completion
 * Use this for long-running models
 */
export async function createAndWaitForPrediction(
  modelId: string,
  input: Record<string, unknown>,
  onProgress?: (prediction: { status: string; logs?: string }) => void
): Promise<unknown> {
  const prediction = await createPrediction(modelId, input);

  // Poll for completion
  const replicate = getReplicateClient();
  let currentPrediction = await replicate.predictions.get(prediction.id);

  while (currentPrediction.status !== 'succeeded' && currentPrediction.status !== 'failed') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    currentPrediction = await replicate.predictions.get(prediction.id);

    if (onProgress) {
      onProgress({ status: currentPrediction.status, logs: currentPrediction.logs ?? undefined });
    }
  }

  if (currentPrediction.status === 'failed') {
    throw new Error(`Model prediction failed: ${currentPrediction.error}`);
  }

  return currentPrediction.output;
}
