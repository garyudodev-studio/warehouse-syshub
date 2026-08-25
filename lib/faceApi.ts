// Client-side only dynamic face-api loader to prevent Next.js SSR evaluation errors

let faceapiInstance: any = null;
let modelsLoaded = false;
let modelLoadingPromise: Promise<void> | null = null;

export async function getFaceApi(): Promise<any> {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!faceapiInstance) {
    faceapiInstance = await import('@vladmandic/face-api');
  }
  return faceapiInstance;
}

export async function loadFaceApiModels(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (modelsLoaded) return;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    const faceapi = await getFaceApi();
    if (!faceapi) return;

    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();

  return modelLoadingPromise;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

export interface DetectionResult {
  descriptor: number[];
  detection: any;
  landmarks: any;
}

/**
 * Extracts a 128-dimensional face descriptor and landmarks from a video element, canvas, or image.
 */
export async function extractFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<DetectionResult | null> {
  if (typeof window === 'undefined') return null;

  const faceapi = await getFaceApi();
  if (!faceapi) return null;

  await loadFaceApiModels();

  let result: any = null;
  try {
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    result = await faceapi
      .detectSingleFace(input, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
  } catch (e) {
    console.warn('SSD MobileNet detection error, attempting TinyFaceDetector:', e);
  }

  if (!result) {
    try {
      const tinyOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
      result = await faceapi
        .detectSingleFace(input, tinyOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
    } catch {
      // ignore
    }
  }

  if (!result) return null;

  return {
    descriptor: Array.from(result.descriptor),
    detection: result.detection,
    landmarks: result.landmarks,
  };
}

export interface MatchResult {
  worker: {
    id: string;
    name: string;
  };
  distance: number;
}

/**
 * Finds the closest worker match for a given descriptor from a list of registered workers.
 * Default distance threshold is 0.6 (lower is a closer match).
 */
export function findBestMatch(
  queryDescriptor: number[] | Float32Array,
  workers: Array<{ id: string; name: string; face_descriptor: number[] | string | unknown }>,
  threshold: number = 0.6
): MatchResult | null {
  if (!workers || workers.length === 0) return null;

  let bestMatch: MatchResult | null = null;
  let minDistance = Infinity;

  const queryArr = Array.isArray(queryDescriptor)
    ? queryDescriptor
    : Array.from(queryDescriptor);

  for (const worker of workers) {
    if (!worker.face_descriptor) continue;

    let targetArr: number[];
    if (Array.isArray(worker.face_descriptor)) {
      targetArr = worker.face_descriptor;
    } else if (typeof worker.face_descriptor === 'string') {
      try {
        targetArr = JSON.parse(worker.face_descriptor);
      } catch {
        continue;
      }
    } else {
      continue;
    }

    if (targetArr.length !== queryArr.length) continue;

    // Euclidean distance calculation: sqrt(sum((a[i] - b[i])^2))
    let sum = 0;
    for (let i = 0; i < queryArr.length; i++) {
      const diff = queryArr[i] - targetArr[i];
      sum += diff * diff;
    }
    const distance = Math.sqrt(sum);

    if (distance < minDistance) {
      minDistance = distance;
      if (distance < threshold) {
        bestMatch = {
          worker: {
            id: worker.id,
            name: worker.name,
          },
          distance,
        };
      }
    }
  }

  return bestMatch;
}
