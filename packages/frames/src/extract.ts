import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';

export interface ExtractOptions {
  interval?: number;
  outputDir?: string;
  format?: 'jpg' | 'png';
  quality?: number;
  maxFrames?: number;
}

export interface ExtractResult {
  frames: string[];
  totalFrames: number;
  duration: number;
  fps: number;
}

/**
 * Safely parse frame rate fraction or decimal string without eval
 * @param rFrameRate Frame rate string, e.g. "30/1" or "29.97"
 * @returns Numeric frame rate
 */
export function parseFrameRate(rFrameRate?: string): number {
  if (!rFrameRate) return 0;
  if (rFrameRate.includes('/')) {
    const [numStr, denStr] = rFrameRate.split('/');
    const num = parseFloat(numStr);
    const den = parseFloat(denStr);
    return den !== 0 && !isNaN(num) && !isNaN(den) ? num / den : 0;
  }
  const parsed = parseFloat(rFrameRate);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Retrieve video metadata using ffprobe
 * @param videoPath Path to video file
 */
function getVideoMetadata(videoPath: string): Promise<{ duration: number; fps: number }> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err || !metadata) {
        if (err) console.warn('Could not get video metadata:', err.message);
        return resolve({ duration: 0, fps: 0 });
      }

      const videoStream = metadata.streams?.find((s) => s.codec_type === 'video');
      resolve({
        duration: metadata.format?.duration || 0,
        fps: parseFrameRate(videoStream?.r_frame_rate),
      });
    });
  });
}

/**
 * Extract frames from a video file
 * @param videoPath Path to the video file
 * @param options Extraction options
 * @returns Promise with extraction results
 */
export async function extractFrames(
  videoPath: string,
  options: ExtractOptions = {}
): Promise<ExtractResult> {
  const {
    interval = 1,
    outputDir = './frames',
    format = 'jpg',
    quality = 2,
    maxFrames,
  } = options;

  if (interval <= 0 || isNaN(interval)) {
    throw new Error(`Invalid interval: ${interval}. Interval must be greater than 0.`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  const extractionPromise = new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .on('start', () => {
        console.log(`Extracting frames from ${videoPath}...`);
      })
      .on('error', (err) => {
        reject(new Error(`Frame extraction failed: ${err.message}`));
      })
      .on('end', () => {
        resolve();
      })
      .outputOptions([
        `-vf fps=1/${interval}`,
        `-q:v ${quality}`,
        ...(maxFrames ? [`-frames:v ${maxFrames}`] : []),
      ])
      .output(path.join(outputDir, `frame-%04d.${format}`))
      .run();
  });

  const [videoInfo] = await Promise.all([
    getVideoMetadata(videoPath),
    extractionPromise,
  ]);

  const files = await fs.readdir(outputDir);
  const frameFiles = files
    .filter((f) => f.match(/^frame-\d+\.(jpg|png)$/))
    .map((f) => path.join(outputDir, f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return {
    frames: frameFiles,
    totalFrames: frameFiles.length,
    duration: videoInfo.duration,
    fps: videoInfo.fps,
  };
}

/**
 * Extract a single frame at a specific timestamp
 * @param videoPath Path to the video file
 * @param timestamp Timestamp in seconds
 * @param outputPath Output path for the frame
 * @returns Promise with the output path
 */
export async function extractFrameAt(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<string> {
  if (timestamp < 0 || isNaN(timestamp)) {
    throw new Error(`Invalid timestamp: ${timestamp}. Timestamp must be non-negative.`);
  }

  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Failed to extract frame: ${err.message}`)))
      .run();
  });
}
