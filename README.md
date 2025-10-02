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

### YouTube 429 "Too Many Requests" Error

If you're getting 429 errors when downloading from YouTube, this is because YouTube detects automated requests. Here's how to fix it:

#### Method 1: Export Browser Cookies (Recommended)

1. **Install Browser Extension**:
   - Chrome: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. **Export Cookies**:
   - Go to [youtube.com](https://youtube.com) and make sure you're logged in
   - Click the extension icon and download `cookies.txt`
   - Save the file as `cookies.txt` in your project root directory

3. **Verify Setup**:
   - Restart your server (`npm run dev`)
   - You should see: `✅ YouTube cookies found - 429 errors should be reduced`

#### Method 2: Use Environment Variable (Production)

For deployed apps (like on Render), use environment variables:

1. **Render.com Setup**:
   - Go to your Render dashboard
   - Navigate to Environment Variables
   - Add: `COOKIES_PATH=/app/cookies.txt`
   - Upload your `cookies.txt` file to your repository

2. **Local Development**:
   ```bash
   # Create .env file
   echo "COOKIES_PATH=/path/to/your/cookies.txt" > .env
   ```

#### Why This Works

- YouTube blocks requests from shared hosting IPs (like Render servers)
- Cookies make your requests appear as legitimate browser sessions
- This reduces bot detection and prevents 429 errors

### Other Common Issues

**"yt-dlp not found"**: Install with `pip install yt-dlp`
**Port in use**: Change PORT in server.js
**Frontend not loading**: Check both servers are running
**Downloads failing**: Check if `downloads/` directory exists and is writable

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
