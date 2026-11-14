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

    // Basic URL pattern and protocol check
    try {
      const parsedUrl = new URL(trimmedUrl);
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
      // Execute yt-dlp to download video (prioritizing <=480p to keep large lectures compact and fast)
      await runner(trimmedUrl, {
        output: outputTemplate,
        format: 'bestvideo[height<=480][ext=mp4]/bestvideo[height<=360][ext=mp4]/best[height<=480]/best',
        noPlaylist: true,
        maxFilesize: '1000m',
        noWarnings: true,
      });
    } catch (ytdlError: any) {
      console.error('yt-dlp execution error:', ytdlError);
      const msg = ytdlError?.message || ytdlError?.stderr || '';

      if (msg.includes('is a live stream') || msg.includes('live event')) {
        return NextResponse.json(
          { error: 'This stream is currently broadcasting live. Please wait until the live stream finishes.' },
          { status: 400 }
        );
      }
      if (msg.includes('Private video') || msg.includes('Sign in')) {
        return NextResponse.json(
          { error: 'This video is private or age-restricted and cannot be downloaded without login.' },
          { status: 400 }
        );
      }
      if (msg.includes('larger than max-filesize') || msg.includes('File is larger')) {
        return NextResponse.json(
          { error: 'This video exceeds the 1GB file size limit. For multi-hour marathon streams, please process locally.' },
          { status: 400 }
        );
      }

      const firstLine = msg.replace(/^ERROR:\s*/i, '').split('\n')[0]?.trim();
      return NextResponse.json(
        { error: firstLine || 'Unable to process this video link. Please verify the URL or try downloading locally.' },
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
