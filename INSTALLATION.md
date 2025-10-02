# Installation Guide

## Quick Start (Windows)

1. **Run the setup script:**
   ```cmd
   setup.bat
   ```

2. **Start the application:**
   ```cmd
   start-dev.bat
   ```

3. **Open your browser:**
   Navigate to http://localhost:3000

## Quick Start (Linux/macOS)

1. **Make scripts executable and run setup:**
   ```bash
   chmod +x setup.sh start-dev.sh start-prod.sh
   ./setup.sh
   ```

2. **Start the application:**
   ```bash
   ./start-dev.sh
   ```

3. **Open your browser:**
   Navigate to http://localhost:3000

## Manual Installation

### Prerequisites

1. **Node.js** (v14+): https://nodejs.org/
2. **yt-dlp**: Install using one of these methods:
   - `pip install yt-dlp`
   - `brew install yt-dlp` (macOS)
   - `winget install yt-dlp` (Windows)
   - Download from: https://github.com/yt-dlp/yt-dlp/releases

### Step-by-Step

1. **Install dependencies:**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

2. **Development mode:**
   ```bash
   npm run dev
   ```
   - Backend: http://localhost:5000
   - Frontend: http://localhost:3000

3. **Production mode:**
   ```bash
   npm run build
   npm start
   ```
   - Application: http://localhost:5000

## Verification

Test your installation with these URLs:

### Video URLs:
- YouTube: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- Vimeo: `https://vimeo.com/76979871`

### Direct File URLs:
- MP4: `https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4`
- MP3: `https://www.soundjay.com/misc/sounds-of-speech.mp3`

## Troubleshooting

### "yt-dlp not found"
```bash
# Check installation
yt-dlp --version

# Install if missing
pip install yt-dlp
```

### "Port already in use"
```bash
# Kill processes using the ports
# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/macOS:
lsof -ti:5000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Frontend not loading
1. Ensure both servers are running
2. Check proxy setting in `client/package.json`
3. Clear browser cache
4. Try incognito/private mode

## Development

### Project Structure
```
universal-video-downloader/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.tsx        # Main component
│   │   └── App.css        # Styles
│   └── package.json
├── downloads/             # Download directory
├── server.js              # Express backend
├── package.json          # Backend dependencies
└── README.md             # Documentation
```

### Available Scripts
- `npm run dev` - Start both servers
- `npm run server` - Backend only
- `npm run client` - Frontend only
- `npm run build` - Build for production
- `npm start` - Production server

## Next Steps

1. **Customize the UI** - Edit `client/src/App.tsx` and `client/src/App.css`
2. **Add features** - Extend the backend API in `server.js`
3. **Deploy** - Use services like Heroku, Vercel, or DigitalOcean
4. **Secure** - Add authentication, HTTPS, and input validation for production

Enjoy your Universal Video Downloader! 🎥⬇️
