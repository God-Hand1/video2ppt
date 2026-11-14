import { NextRequest, NextResponse } from 'next/server';
import youtubedl from 'yt-dlp-exec';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Periodically clean up files in downloads/ older than 1 hour
function cleanupOldFiles(downloadsDir: string) {
  try {
    if (!fs.existsSync(downloadsDir)) return;
    const now = Date.now();
    const files = fs.readdirSync(downloadsDir);
    for (const file of files) {
      const fullPath = path.join(downloadsDir, file);
      const stat = fs.statSync(fullPath);
      // 1 hour = 3600000 ms
      if (stat.isFile() && now - stat.mtimeMs > 3600000) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.warn('Cleanup warning:', err);
  }
}

// Check for cookies file or environment variable for bypassing YouTube bot checks
function getCookiesPath(): string | undefined {
  try {
    // 1. Direct file in project root
    const localCookies = path.join(process.cwd(), 'cookies.txt');
    if (fs.existsSync(localCookies)) {
      return localCookies;
    }

    // 2. Environment variable YOUTUBE_COOKIES (e.g. set in Render dashboard)
    if (process.env.YOUTUBE_COOKIES) {
      const downloadsDir = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      const envCookiesPath = path.join(downloadsDir, 'cookies.txt');
      fs.writeFileSync(envCookiesPath, process.env.YOUTUBE_COOKIES, 'utf-8');
      return envCookiesPath;
    }
  } catch (err) {
    console.warn('Cookies resolution warning:', err);
  }
  return undefined;
}

// Locate static ffmpeg binary if available
function getFfmpegPath(): string | undefined {
  try {
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(ffmpegPath, 0o755);
        } catch {
          // ignore chmod errors
        }
      }
      return ffmpegPath;
    }
  } catch {
    // ignore
  }

  const candidatePath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(candidatePath)) {
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(candidatePath, 0o755);
      } catch {
        // ignore
      }
    }
    return candidatePath;
  }

  return undefined;
}

// Normalize YouTube and video URLs into canonical player endpoints
function normalizeVideoUrl(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    const urlObj = new URL(trimmed);

    // YouTube URLs
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      // 1. /live/VIDEO_ID
      const liveMatch = urlObj.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
      if (liveMatch && liveMatch[1]) {
        return `https://www.youtube.com/watch?v=${liveMatch[1]}`;
      }

      // 2. /shorts/VIDEO_ID
      const shortsMatch = urlObj.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch && shortsMatch[1]) {
        return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
      }

      // 3. /embed/VIDEO_ID
      const embedMatch = urlObj.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch && embedMatch[1]) {
        return `https://www.youtube.com/watch?v=${embedMatch[1]}`;
      }

      // 4. youtu.be/VIDEO_ID
      if (urlObj.hostname.includes('youtu.be')) {
        const id = urlObj.pathname.replace(/^\//, '').split('/')[0];
        if (id) {
          return `https://www.youtube.com/watch?v=${id}`;
        }
      }

      // 5. Standard watch?v=VIDEO_ID (strip extraneous tracking query params like ?si= or &t=)
      const v = urlObj.searchParams.get('v');
      if (v) {
        return `https://www.youtube.com/watch?v=${v}`;
      }
    }
    return trimmed;
  } catch {
    return rawUrl.trim();
  }
}

// Locate yt-dlp binary with robust path resolution for Next.js bundling on Render/Linux
function getYtDlpRunner() {
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const candidatePaths = [
    path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', binaryName),
    path.join(process.cwd(), 'bin', binaryName),
    path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'yt-dlp-exec', 'bin', binaryName),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(candidate, 0o755);
        } catch {
          // ignore chmod errors
        }
      }
      return (youtubedl as any).create(candidate);
    }
  }

  // Fallback to default
  return youtubedl;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    const targetUrl = normalizeVideoUrl(trimmedUrl);

    // Basic URL pattern and protocol check
    try {
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return NextResponse.json({ error: 'URL must begin with http:// or https://' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const downloadsDir = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Clean old files
    cleanupOldFiles(downloadsDir);

    const requestId = crypto.randomUUID();
    const outputTemplate = path.join(downloadsDir, `${requestId}_%(title).40s.%(ext)s`);

    try {
      const runner = getYtDlpRunner();
      const ffmpegPath = getFfmpegPath();
      const cookiesPath = getCookiesPath();

      const dlFlags: Record<string, any> = {
        output: outputTemplate,
        format: 'bestvideo[height<=480][ext=mp4]/bestvideo[height<=360][ext=mp4]/best[height<=480]/best',
        noPlaylist: true,
        maxFilesize: '1000m',
        noWarnings: true,
        concurrentFragments: 4,
        geoBypass: true,
        noCheckCertificates: true,
      };

      if (ffmpegPath) {
        dlFlags.ffmpegLocation = ffmpegPath;
      }

      if (cookiesPath) {
        dlFlags.cookies = cookiesPath;
      }

      // Execute yt-dlp to download video
      await runner(targetUrl, dlFlags);
    } catch (ytdlError: any) {
      console.error('yt-dlp execution error:', ytdlError);
      const stderr = (ytdlError?.stderr || '').trim();
      const rawMsg = (stderr || ytdlError?.message || '').trim();

      if (rawMsg.includes('is a live stream') || rawMsg.includes('live event')) {
        return NextResponse.json(
          { error: 'This stream is currently broadcasting live. Please wait until the live stream finishes.' },
          { status: 400 }
        );
      }
      if (
        rawMsg.includes('Private video') ||
        rawMsg.includes('Sign in to confirm') ||
        rawMsg.includes('player response') ||
        rawMsg.includes('bot') ||
        rawMsg.includes('LOGIN_REQUIRED')
      ) {
        return NextResponse.json(
          {
            error: 'YouTube requires authentication or bot verification for this video on cloud servers. Please use the Local Video tab to convert directly in your browser, or configure YOUTUBE_COOKIES in Render.',
            code: 'YOUTUBE_RESTRICTED'
          },
          { status: 400 }
        );
      }
      if (rawMsg.includes('larger than max-filesize') || rawMsg.includes('File is larger')) {
        return NextResponse.json(
          { error: 'This video exceeds the 1GB file size limit. For multi-hour marathon streams, please process locally.' },
          { status: 400 }
        );
      }

      // Extract specific error line without raw command output or bug report links
      const errorLine = stderr
        .split('\n')
        .map((l: string) => l.trim())
        .find((l: string) => l.startsWith('ERROR:') || l.includes('Error:'));

      const cleanError = errorLine
        ? errorLine.replace(/^ERROR:\s*/i, '').replace(/please report this issue.*/i, '').trim()
        : 'Unable to download this video stream. Please verify the URL or try downloading locally.';

      return NextResponse.json(
        { error: cleanError },
        { status: 400 }
      );
    }

    // Locate the downloaded file by requestId prefix
    const downloadedFiles = fs.readdirSync(downloadsDir);
    const targetFile = downloadedFiles.find((f) => f.startsWith(requestId));

    if (!targetFile) {
      return NextResponse.json(
        { error: 'Video download completed but output file could not be found.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'success',
      message: 'Video processed successfully',
      url: `/api/get-file?file=${encodeURIComponent(targetFile)}`,
      filename: targetFile,
      status_code: 200,
      request_id: requestId,
    });
  } catch (error: any) {
    console.error('Process online video error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
