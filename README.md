# Universal Video Downloader

Download videos from 1000+ websites including YouTube, Vimeo, Facebook, Instagram, TikTok, and more.

## Features

- 🌐 Download from 1000+ websites
- 🎥 MP4 video downloads with quality selection
- 🎵 MP3 audio extraction
- 📁 Direct file link support
- 📱 Modern, responsive interface
- 🍪 Cookie consent popup

## Quick Start

### Windows
```cmd
setup.bat
start-dev.bat
```

### Linux/macOS
```bash
chmod +x *.sh
./setup.sh
./start-dev.sh
```

### Manual Setup
```bash
# Install yt-dlp first
pip install yt-dlp

# Install dependencies
npm run setup

# Start development mode
npm run dev
```

Open http://localhost:3000 in your browser.

## Usage

1. Paste a video URL or direct file link
2. Click "Analyze" to extract information
3. Choose format (MP4/MP3) and quality
4. Click "Download"

### Supported URLs
- YouTube: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- Vimeo: `https://vimeo.com/123456789`
- Direct files: `https://example.com/video.mp4`

## Requirements

- **Node.js** (v14+): https://nodejs.org/
- **yt-dlp**: `pip install yt-dlp`

## Scripts

- `npm run dev` - Start both servers
- `npm run server` - Backend only
- `npm run client` - Frontend only
- `npm run build` - Build for production
- `npm start` - Production server

## Troubleshooting

**"yt-dlp not found"**: Install with `pip install yt-dlp`
**Port in use**: Change PORT in server.js
**Frontend not loading**: Check both servers are running

## Deployment

### Deploy to Render.com (Free)
1. Push code to GitHub
2. Connect to [Render.com](https://render.com)
3. Use build command: `npm run render-build`
4. Use start command: `npm start`
5. Set `NODE_ENV=production`

See [DEPLOY.md](DEPLOY.md) for detailed instructions.

## Legal Notice

For educational and personal use only. Respect copyright laws and website terms of service.
