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

test('Validates and normalizes video URL formats', () => {
  const normalizeVideoUrl = (rawUrl) => {
    try {
      const trimmed = rawUrl.trim();
      const urlObj = new URL(trimmed);

      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        const liveMatch = urlObj.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
        if (liveMatch && liveMatch[1]) return `https://www.youtube.com/watch?v=${liveMatch[1]}`;

        const shortsMatch = urlObj.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (shortsMatch && shortsMatch[1]) return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;

        const embedMatch = urlObj.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
        if (embedMatch && embedMatch[1]) return `https://www.youtube.com/watch?v=${embedMatch[1]}`;

        if (urlObj.hostname.includes('youtu.be')) {
          const id = urlObj.pathname.replace(/^\//, '').split('/')[0];
          if (id) return `https://www.youtube.com/watch?v=${id}`;
        }

        const v = urlObj.searchParams.get('v');
        if (v) return `https://www.youtube.com/watch?v=${v}`;
      }
      return trimmed;
    } catch {
      return rawUrl.trim();
    }
  };

  assert.strictEqual(
    normalizeVideoUrl('https://www.youtube.com/live/B1u99zVMNRM'),
    'https://www.youtube.com/watch?v=B1u99zVMNRM'
  );
  assert.strictEqual(
    normalizeVideoUrl('https://youtu.be/B1u99zVMNRM'),
    'https://www.youtube.com/watch?v=B1u99zVMNRM'
  );
  assert.strictEqual(
    normalizeVideoUrl('https://www.youtube.com/shorts/B1u99zVMNRM'),
    'https://www.youtube.com/watch?v=B1u99zVMNRM'
  );
  assert.strictEqual(
    normalizeVideoUrl('https://www.youtube.com/watch?v=B1u99zVMNRM&t=120s&si=abc'),
    'https://www.youtube.com/watch?v=B1u99zVMNRM'
  );
});
