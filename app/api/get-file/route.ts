import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');

    if (!fileName) {
      return new NextResponse('File name parameter is required', { status: 400 });
    }

    // Sanitize fileName to prevent directory traversal attacks
    const safeFileName = path.basename(fileName);
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
      return new NextResponse('Invalid file name', { status: 400 });
    }

    const downloadsDir = path.resolve(process.cwd(), 'downloads');
    const filePath = path.resolve(downloadsDir, safeFileName);

    if (!filePath.startsWith(downloadsDir + path.sep)) {
      return new NextResponse('Access denied', { status: 403 });
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return new NextResponse('File not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(safeFileName).toLowerCase();
    
    let contentType = 'application/octet-stream';
    if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.mov') contentType = 'video/quicktime';
    else if (ext === '.pptx') contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFileName)}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('File retrieval error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
