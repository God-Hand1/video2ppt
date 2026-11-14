#!/usr/bin/env python3
"""
Video2PPT - Web Application
FastAPI application for converting uploaded videos to PowerPoint presentations
"""

import os
import shutil
import tempfile
import logging
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from main import Video2PPT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video2ppt-app")

app = FastAPI(
    title="Video2PPT",
    description="Convert video presentations to PowerPoint slides",
    version="1.0.0",
)

HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video2PPT - Video to PowerPoint Converter</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .container {
      width: 100%;
      max-width: 600px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      color: #fff;
    }
    .header p {
      color: var(--muted);
      font-size: 0.95rem;
    }
    .upload-zone {
      border: 2px dashed var(--border);
      border-radius: 0.75rem;
      padding: 2.5rem 1.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(15, 23, 42, 0.4);
      margin-bottom: 1.5rem;
    }
    .upload-zone:hover, .upload-zone.dragover {
      border-color: var(--primary);
      background: rgba(37, 99, 235, 0.05);
    }
    .upload-zone svg {
      width: 48px;
      height: 48px;
      color: var(--muted);
      margin-bottom: 1rem;
    }
    .upload-zone p {
      font-size: 0.95rem;
      color: var(--text);
      margin-bottom: 0.25rem;
    }
    .upload-zone span {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .file-input { display: none; }
    .file-info {
      margin-top: 0.75rem;
      font-size: 0.875rem;
      color: #38bdf8;
      word-break: break-all;
    }
    .form-group {
      margin-bottom: 1.5rem;
    }
    .form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: var(--text);
    }
    .form-group select, .form-group input {
      width: 100%;
      padding: 0.75rem;
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      color: var(--text);
      font-size: 0.95rem;
      outline: none;
    }
    .form-group select:focus, .form-group input:focus {
      border-color: var(--primary);
    }
    .form-hint {
      font-size: 0.8rem;
      color: var(--muted);
      margin-top: 0.35rem;
    }
    .btn {
      width: 100%;
      padding: 0.85rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
    }
    .btn:hover:not(:disabled) {
      background: var(--primary-hover);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .status {
      margin-top: 1.5rem;
      padding: 1rem;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      display: none;
    }
    .status.loading {
      display: block;
      background: rgba(37, 99, 235, 0.1);
      border: 1px solid rgba(37, 99, 235, 0.3);
      color: #60a5fa;
    }
    .status.error {
      display: block;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }
    .status.success {
      display: block;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
    }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 Video2PPT</h1>
      <p>Convert video presentations into PowerPoint slides</p>
    </div>

    <form id="convertForm">
      <div class="upload-zone" id="dropZone">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <p>Click to choose a video or drag & drop here</p>
        <span>Supports MP4, MOV, AVI, MKV, WebM</span>
        <div class="file-info" id="fileInfo"></div>
        <input type="file" id="videoInput" class="file-input" accept="video/*" required>
      </div>

      <div class="form-group">
        <label for="intervalInput">Snapshot Interval (seconds)</label>
        <select id="intervalInput">
          <option value="1">1 second (maximum detail, larger file)</option>
          <option value="2">2 seconds (high detail)</option>
          <option value="5" selected>5 seconds (recommended for slide decks)</option>
          <option value="10">10 seconds (fastest, compact file)</option>
        </select>
        <div class="form-hint">Extracts 1 frame every N seconds from the video.</div>
      </div>

      <button type="submit" class="btn" id="submitBtn">
        <span>Convert to PowerPoint</span>
      </button>
    </form>

    <div class="status" id="statusBox"></div>
  </div>

  <script>
    const dropZone = document.getElementById('dropZone');
    const videoInput = document.getElementById('videoInput');
    const fileInfo = document.getElementById('fileInfo');
    const convertForm = document.getElementById('convertForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusBox = document.getElementById('statusBox');

    dropZone.addEventListener('click', () => videoInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        videoInput.files = e.dataTransfer.files;
        updateFileInfo();
      }
    });

    videoInput.addEventListener('change', updateFileInfo);

    function updateFileInfo() {
      if (videoInput.files.length > 0) {
        const file = videoInput.files[0];
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        fileInfo.textContent = `Selected: ${file.name} (${sizeMb} MB)`;
      } else {
        fileInfo.textContent = '';
      }
    }

    convertForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!videoInput.files.length) return;

      const file = videoInput.files[0];
      const interval = document.getElementById('intervalInput').value;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="spinner"></div><span>Converting video...</span>';
      statusBox.className = 'status loading';
      statusBox.textContent = 'Processing video and generating presentation slides... This may take a moment depending on video length.';

      const formData = new FormData();
      formData.append('video', file);
      formData.append('interval', interval);

      try {
        const response = await fetch('/convert', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Conversion failed with status ${response.status}`);
        }

        const blob = await response.blob();
        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${baseName}_presentation.pptx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        statusBox.className = 'status success';
        statusBox.textContent = '✅ Presentation generated and downloaded successfully!';
      } catch (err) {
        statusBox.className = 'status error';
        statusBox.textContent = `❌ Error: ${err.message}`;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Convert to PowerPoint</span>';
      }
    });
  </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def index():
    return HTML_PAGE

@app.get("/health")
async def health():
    return {"status": "ok"}

def cleanup_files(*paths):
    for p in paths:
        try:
            if os.path.isdir(p):
                shutil.rmtree(p, ignore_errors=True)
            elif os.path.exists(p):
                os.remove(p)
        except Exception as e:
            logger.warning(f"Error cleaning up {p}: {e}")

@app.post("/convert")
async def convert_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    interval: int = Form(default=5),
):
    if interval <= 0:
        raise HTTPException(status_code=400, detail="Interval must be a positive number.")

    if not video.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    temp_dir = tempfile.mkdtemp(prefix="v2p_web_")
    safe_filename = Path(video.filename).name
    temp_video_path = os.path.join(temp_dir, safe_filename)
    stem = Path(safe_filename).stem or "presentation"
    output_pptx_path = os.path.join(temp_dir, f"{stem}_output.pptx")

    try:
        with open(temp_video_path, "wb") as f:
            shutil.copyfileobj(video.file, f)
    except Exception as e:
        cleanup_files(temp_dir)
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded video: {str(e)}")

    try:
        converter = Video2PPT(temp_video_path, output_pptx_path, fps_interval=interval)
        converter.convert()
    except Exception as e:
        cleanup_files(temp_dir)
        raise HTTPException(status_code=400, detail=f"Conversion failed: {str(e)}")

    if not os.path.exists(output_pptx_path):
        cleanup_files(temp_dir)
        raise HTTPException(status_code=500, detail="Presentation was not generated.")

    # Schedule cleanup of the temporary directory and output files after the response has finished streaming
    background_tasks.add_task(cleanup_files, temp_dir)

    return FileResponse(
        path=output_pptx_path,
        filename=f"{stem}_output.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
