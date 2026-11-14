import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { promises as fs } from 'fs';

export interface CompareOptions {
  threshold?: number;
  includeAA?: boolean;
  resizeWidth?: number;
}

export interface CompareResult {
  difference: number;
  pixelsDifferent: number;
  totalPixels: number;
  percentDifferent: number;
}

/**
 * Compare two images and calculate their difference
 * @param image1Path Path to the first image
 * @param image2Path Path to the second image
 * @param options Comparison options
 * @returns Promise with comparison results
 */
export async function compareFrames(
  image1Path: string,
  image2Path: string,
  options: CompareOptions = {}
): Promise<CompareResult> {
  const { threshold = 0.1, includeAA = false, resizeWidth = 640 } = options;

  const [img1Buffer, img2Buffer] = await Promise.all([
    fs.readFile(image1Path),
    fs.readFile(image2Path),
  ]);

  let [img1Resized, img2Resized] = await Promise.all([
    sharp(img1Buffer)
      .resize(resizeWidth, null, { fit: 'inside' })
      .png()
      .toBuffer(),
    sharp(img2Buffer)
      .resize(resizeWidth, null, { fit: 'inside' })
      .png()
      .toBuffer(),
  ]);

  let png1 = PNG.sync.read(img1Resized);
  let png2 = PNG.sync.read(img2Resized);

  // If heights or widths differ (e.g. aspect ratio mismatch or rounding), normalize img2 to match png1 canvas
  if (png1.width !== png2.width || png1.height !== png2.height) {
    img2Resized = await sharp(img2Buffer)
      .resize(png1.width, png1.height, { fit: 'fill' })
      .png()
      .toBuffer();
    png2 = PNG.sync.read(img2Resized);
  }

  const diff = new PNG({ width: png1.width, height: png1.height });
  const pixelsDifferent = pixelmatch(
    png1.data,
    png2.data,
    diff.data,
    png1.width,
    png1.height,
    { threshold, includeAA }
  );

  const totalPixels = png1.width * png1.height;
  const percentDifferent = (pixelsDifferent / totalPixels) * 100;

  return {
    difference: pixelsDifferent,
    pixelsDifferent,
    totalPixels,
    percentDifferent,
  };
}

/**
 * Compare multiple frames sequentially and detect scene changes
 * @param framePaths Array of frame paths
 * @param sceneThreshold Percentage threshold for scene change (0-100)
 * @param options Comparison options
 * @returns Promise with array of scene change indices
 */
export async function detectSceneChanges(
  framePaths: string[],
  sceneThreshold: number = 30,
  options: CompareOptions = {}
): Promise<number[]> {
  if (framePaths.length === 0) {
    return [];
  }

  const sceneChanges: number[] = [0];

  for (let i = 1; i < framePaths.length; i++) {
    const result = await compareFrames(framePaths[i - 1], framePaths[i], options);

    if (result.percentDifferent > sceneThreshold) {
      sceneChanges.push(i);
    }
  }

  return sceneChanges;
}

/**
 * Calculate structural similarity between two frames (0-1 scale)
 * @param image1Path Path to the first image
 * @param image2Path Path to the second image
 * @param options Comparison options
 * @returns Promise with similarity score (0 = completely different, 1 = identical)
 */
export async function calculateSimilarity(
  image1Path: string,
  image2Path: string,
  options: CompareOptions = {}
): Promise<number> {
  const result = await compareFrames(image1Path, image2Path, options);
  return 1 - result.percentDifferent / 100;
}
