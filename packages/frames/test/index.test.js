const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs').promises;
const sharp = require('sharp');

const {
  parseFrameRate,
  calculateSimilarity,
  compareFrames,
  detectSceneChanges,
  extractFrames,
  extractFrameAt,
} = require('../dist/index.js');

test('parseFrameRate correctly parses fractions and numbers without eval', () => {
  assert.strictEqual(parseFrameRate('30/1'), 30);
  assert.strictEqual(parseFrameRate('30000/1001'), 30000 / 1001);
  assert.strictEqual(parseFrameRate('25'), 25);
  assert.strictEqual(parseFrameRate('0/0'), 0);
  assert.strictEqual(parseFrameRate(''), 0);
  assert.strictEqual(parseFrameRate(undefined), 0);
  assert.strictEqual(parseFrameRate('invalid'), 0);
});

test('extractFrames and extractFrameAt validate invalid inputs', async () => {
  await assert.rejects(
    async () => {
      await extractFrames('dummy.mp4', { interval: 0 });
    },
    /Invalid interval/
  );

  await assert.rejects(
    async () => {
      await extractFrames('dummy.mp4', { interval: -1 });
    },
    /Invalid interval/
  );

  await assert.rejects(
    async () => {
      await extractFrameAt('dummy.mp4', -5, 'out.jpg');
    },
    /Invalid timestamp/
  );
});

test('detectSceneChanges handles empty and single item arrays', async () => {
  const emptyResult = await detectSceneChanges([]);
  assert.deepStrictEqual(emptyResult, []);

  const singleResult = await detectSceneChanges(['non_existent.jpg']);
  assert.deepStrictEqual(singleResult, [0]);
});

test('compareFrames, calculateSimilarity, and detectSceneChanges with synthesized test images', async () => {
  const tempDir = path.join(__dirname, 'temp_test_images');
  await fs.mkdir(tempDir, { recursive: true });

  const img1Path = path.join(tempDir, 'img1.png');
  const img2Path = path.join(tempDir, 'img2.png');
  const imgDiffAspectPath = path.join(tempDir, 'img_diff_aspect.png');
  const imgBlackPath = path.join(tempDir, 'img_black.png');

  try {
    // Generate white 100x100 image
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toFile(img1Path);

    // Duplicate white image
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toFile(img2Path);

    // Generate black 100x100 image
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(imgBlackPath);

    // Generate image with different aspect ratio (120x80)
    await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toFile(imgDiffAspectPath);

    // 1. Identical images comparison
    const sameResult = await compareFrames(img1Path, img2Path);
    assert.strictEqual(sameResult.pixelsDifferent, 0);
    assert.strictEqual(sameResult.percentDifferent, 0);

    const similaritySame = await calculateSimilarity(img1Path, img2Path);
    assert.strictEqual(similaritySame, 1);

    // 2. Completely different images (white vs black)
    const diffResult = await compareFrames(img1Path, imgBlackPath);
    assert.strictEqual(diffResult.percentDifferent, 100);

    const similarityDiff = await calculateSimilarity(img1Path, imgBlackPath);
    assert.strictEqual(similarityDiff, 0);

    // 3. Different aspect ratio normalization test (must not crash)
    const aspectResult = await compareFrames(img1Path, imgDiffAspectPath);
    assert.ok(typeof aspectResult.percentDifferent === 'number');

    // 4. detectSceneChanges across sequence
    const sceneChanges = await detectSceneChanges(
      [img1Path, img2Path, imgBlackPath],
      30
    );
    // Scene 0 is start (index 0), Scene 2 is black image change (index 2)
    assert.deepStrictEqual(sceneChanges, [0, 2]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
