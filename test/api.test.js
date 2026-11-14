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

test('Sanitizes error messages for end users and catches bot/restriction errors', () => {
  const sanitizeError = (stderr, rawMsg) => {
    if (rawMsg.includes('is a live stream') || rawMsg.includes('live event')) {
      return { status: 400, error: 'This stream is currently broadcasting live. Please wait until the live stream finishes.' };
    }
    if (
      rawMsg.includes('Private video') ||
      rawMsg.includes('Sign in to confirm') ||
      rawMsg.includes('player response') ||
      rawMsg.includes('bot') ||
      rawMsg.includes('LOGIN_REQUIRED')
    ) {
      return {
        status: 400,
        error: 'YouTube requires authentication or bot verification for this video on cloud servers. Please use the Local Video tab to convert directly in your browser, or configure YOUTUBE_COOKIES in Render.',
        code: 'YOUTUBE_RESTRICTED'
      };
    }
    if (rawMsg.includes('larger than max-filesize') || rawMsg.includes('File is larger')) {
      return { status: 400, error: 'This video exceeds the 1GB file size limit. For marathon streams, please process via Local Video.' };
    }

    const errorLine = stderr
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('ERROR:') || l.includes('Error:'));

    const cleanError = errorLine
      ? errorLine.replace(/^ERROR:\s*/i, '').replace(/please report this issue.*/i, '').trim()
      : 'Unable to download this video stream. Please verify the URL or try downloading locally.';

    return { status: 400, error: cleanError };
  };

  const botErr = sanitizeError(
    'ERROR: [youtube] B1u99zVMNRM: Failed to extract any player response; please report this issue...',
    'ERROR: [youtube] B1u99zVMNRM: Failed to extract any player response; please report this issue...'
  );
  assert.strictEqual(botErr.code, 'YOUTUBE_RESTRICTED');
  assert.match(botErr.error, /YouTube requires authentication/);

  const genericErr = sanitizeError(
    'ERROR: Unsupported URL: https://invalid.com/video\nSome trace',
    'ERROR: Unsupported URL: https://invalid.com/video'
  );
  assert.strictEqual(genericErr.error, 'Unsupported URL: https://invalid.com/video');
});
