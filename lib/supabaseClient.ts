import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing in environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface WorkerRecord {
  id: string;
  name: string;
  role?: string;
  photo_url?: string;
  face_descriptor: number[];
  created_at: string;
}

export interface ContainerRecord {
  id: string;
  container_number: string;
  created_at: string;
}

export interface AccessLogRecord {
  id: string;
  worker_id: string;
  container_id: string;
  activity?: string;
  notes?: string;
  scanned_at: string;
  workers?: {
    name: string;
    role?: string;
    photo_url?: string;
  };
  containers?: {
    container_number: string;
  };
}

export interface AdminSettingsRecord {
  id: string;
  passcode: string;
  updated_at?: string;
}

/**
 * Captures and compresses a video frame to JPEG format (under 100KB, max 400x400).
 */
export function captureAndCompressCanvas(
  videoElement: HTMLVideoElement,
  maxDim: number = 360,
  quality: number = 0.75
): Promise<{ blob: Blob; dataUrl: string; sizeKb: number }> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      let width = videoElement.videoWidth || 640;
      let height = videoElement.videoHeight || 480;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      // Mirror mode flip for front camera preview match
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoElement, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob'));
            return;
          }
          const sizeKb = Math.round(blob.size / 1024);
          resolve({ blob, dataUrl, sizeKb });
        },
        'image/jpeg',
        quality
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Extracts bucket name and file path from a Supabase Storage URL or file path.
 */
export function parseBucketAndPathFromUrl(
  urlOrPath: string,
  defaultBucket: string = 'warehouse_avatars'
): { bucket: string; path: string } | null {
  if (!urlOrPath || urlOrPath.startsWith('data:')) return null;

  try {
    if (urlOrPath.includes('/storage/v1/object/')) {
      const rawPath = urlOrPath.split('/storage/v1/object/')[1];
      const segments = rawPath.split('?')[0].split('#')[0].split('/');
      
      // If segment[0] is 'public' or 'authenticated' or 'sign'
      if (['public', 'authenticated', 'sign'].includes(segments[0])) {
        segments.shift();
      }
      
      if (segments.length >= 2) {
        const bucket = segments[0];
        const path = decodeURIComponent(segments.slice(1).join('/'));
        return { bucket, path };
      }
    }

    // Fallback: if filename matches avatar_... pattern or direct filename
    const clean = urlOrPath.split('?')[0].split('#')[0];
    const filename = clean.substring(clean.lastIndexOf('/') + 1);
    if (filename && filename.includes('.')) {
      return { bucket: defaultBucket, path: decodeURIComponent(filename) };
    }
  } catch (err) {
    console.warn('Error parsing storage URL:', err);
  }

  return null;
}

/**
 * Deletes a worker record from `warehouse_workers` table and automatically
 * removes their photo file from the Supabase Storage bucket.
 */
export async function deleteWorkerWithStorage(workerId: string): Promise<{ error: any }> {
  try {
    const { data: worker } = await supabase
      .from('warehouse_workers')
      .select('photo_url')
      .eq('id', workerId)
      .maybeSingle();

    if (worker?.photo_url) {
      const storageInfo = parseBucketAndPathFromUrl(worker.photo_url, 'warehouse_avatars');
      if (storageInfo) {
        const { bucket, path } = storageInfo;
        const { error: storageErr } = await supabase.storage.from(bucket).remove([path]);
        if (storageErr) {
          console.warn(`Bucket file deletion notice (${bucket}/${path}):`, storageErr);
        } else {
          console.log(`Automated cleanup: Deleted bucket file ${path} from ${bucket}`);
        }
      }
    }

    const { error } = await supabase.from('warehouse_workers').delete().eq('id', workerId);
    return { error };
  } catch (err) {
    console.error('Error in deleteWorkerWithStorage:', err);
    return { error: err };
  }
}

