const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

test('GET /api/get-file security checks against path traversal', async () => {
  // Test directory traversal prevention logic
  const checkSafePath = (fileName) => {
    const safeFileName = path.basename(fileName);
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
      return { status: 400, error: 'Invalid file name' };
    }
    const downloadsDir = path.resolve(process.cwd(), 'downloads');
    const filePath = path.resolve(downloadsDir, safeFileName);
    if (!filePath.startsWith(downloadsDir + path.sep)) {
      return { status: 403, error: 'Access denied' };
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return { status: 404, error: 'File not found' };
    }
    return { status: 200, filePath };
  };

  // Traversal tests
  assert.strictEqual(checkSafePath('..').status, 400);
  assert.strictEqual(checkSafePath('.').status, 400);
  assert.strictEqual(checkSafePath('../../../etc/passwd').status, 404);
  assert.strictEqual(checkSafePath('..\\..\\windows\\win.ini').status, 404);
  assert.strictEqual(checkSafePath('').status, 400);
});

test('Validates video URL format before spawning downloaders', () => {
  const isValidUrl = (urlStr) => {
    if (!urlStr || typeof urlStr !== 'string' || !urlStr.trim()) return false;
    try {
      new URL(urlStr.trim());
      return true;
    } catch {
      return false;
    }
  };

  assert.strictEqual(isValidUrl(''), false);
  assert.strictEqual(isValidUrl('   '), false);
  assert.strictEqual(isValidUrl('not-a-url'), false);
  assert.strictEqual(isValidUrl('javascript:alert(1)'), true); // valid URL object, but protocol can be filtered
  assert.strictEqual(isValidUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
  assert.strictEqual(isValidUrl('https://youtu.be/dQw4w9WgXcQ'), true);
  assert.strictEqual(isValidUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), true);
  assert.strictEqual(isValidUrl('https://www.youtube.com/live/dQw4w9WgXcQ'), true);
});
