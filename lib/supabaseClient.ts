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
