# <img src="assets/logo.svg" alt="Video2PPT" width="30"> Video2PPT

Developer tools for video frame extraction and scene comparison.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@video2ppt/frames.svg)](https://www.npmjs.com/package/@video2ppt/frames)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)

## npm Package

Extract frames and compare scenes with `@video2ppt/frames`:

```bash
npx @video2ppt/frames extract video.mp4 --interval 5 --output ./frames
npx @video2ppt/frames compare frame1.jpg frame2.jpg
```

Install for programmatic use:

```bash
npm install @video2ppt/frames
```

**Requirements:** Node.js 16+, FFmpeg

**[Full package documentation →](packages/frames/README.md)**

## Web Application & Cloud Deployment

Video2PPT includes a production-ready FastAPI web server with a built-in drag-and-drop web UI:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Endpoints
- **Web UI:** `GET /` — Interactive web interface to drag & drop videos and download PowerPoint files.
- **Health Check:** `GET /health` — Service health probe (returns `{"status": "ok"}`).
- **API Conversion:** `POST /convert` — Accepts `multipart/form-data` with `video` (file) and `interval` (seconds, default 5). Streams the generated `.pptx` presentation.

### Deploying to Render.com
- **Environment:** `Python 3`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`

## Python CLI

Legacy frame extraction tool:

```bash
python3 main.py video.mp4 -i 5 -o output.pptx
```

**Requirements:** Python 3.11+

**Installation:**
```bash
git clone https://github.com/wangxs404/video2ppt.git
cd video2ppt
pip install -r requirements.txt
```

**Command reference:**
```
python3 main.py <video> [-i INTERVAL] [-o OUTPUT]

Arguments:
  video                 Input video file
  -i, --interval       Frame extraction interval in seconds (default: 1)
  -o, --output         Output PowerPoint file path
```

## Performance

Benchmark on 76MB, 37-minute MP4 (Python CLI):

| Interval | Time | File Size | Slides |
|----------|------|-----------|--------|
| -i 10    | ~7s  | ~9 MB     | ~222   |
| -i 5     | ~14s | ~17 MB    | ~444   |
| -i 2     | ~28s | ~33 MB    | ~1110  |
| -i 1     | ~55s | ~80 MB    | ~2220  |

Recommended: `-i 5` for typical use.

## Full Product

This repository provides developer frame extraction and comparison tools. The complete video-to-presentation conversion product, including automatic PowerPoint generation and smart layouts, is available at [video2ppt.com](https://video2ppt.com).

## Documentation

- [English](docs/README_en.md)
- [简体中文](docs/README_zh.md)
- [日本語](docs/README_ja.md)
- [Español](docs/README_es.md)

## License

MIT License. See [LICENSE](LICENSE) for details.

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss proposed changes.

[Report issues](https://github.com/wangxs404/video2ppt/issues)
