const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const axios = require('axios');
const { existsSync } = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Cookie configuration
const COOKIES_PATH = process.env.COOKIES_PATH || path.join(__dirname, 'cookies.txt');
const USE_COOKIES = existsSync(COOKIES_PATH);

if (USE_COOKIES) {
  console.log('✅ YouTube cookies found - 429 errors should be reduced');
} else {
  console.log('⚠️  No cookies.txt found - YouTube may return 429 errors');
  console.log('   Create cookies.txt from cookies.txt.example to fix this');
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Stricter rate limiting for API endpoints to avoid YouTube bot detection
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 API requests per 5 minutes
  message: {
    error: 'Too many requests. Please wait 5 minutes before trying again.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(generalLimiter);

// CORS and JSON parsing
const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || true
    : 'http://localhost:3000',
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Serve static files from React build (only in production)
const buildPath = path.join(__dirname, 'client/build');
if (require('fs').existsSync(buildPath)) {
  app.use(express.static(buildPath));
}

// URL analysis endpoint
app.post('/api/analyze', apiLimiter, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check if it's a direct file URL
    const fileExtension = getFileExtension(url);
    if (fileExtension) {
      return res.json({
        type: 'file',
        url: url,
        extension: fileExtension,
        filename: getFilenameFromUrl(url),
        fileSize: await getFileSize(url)
      });
    }

    // Use yt-dlp to analyze video URL
    const videoInfo = await analyzeVideoUrl(url);
    
    res.json({
      type: 'video',
      ...videoInfo
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze URL',
      message: error.message 
    });
  }
});

// Download endpoint
app.post('/api/download', apiLimiter, async (req, res) => {
  try {
    const { url, format, quality } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const downloadResult = await downloadContent(url, format, quality);
    
    res.json(downloadResult);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Failed to download content',
      message: error.message 
    });
  }
});

// Helper functions
function getFileExtension(url) {
  const extensions = ['.mp4', '.mp3', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4a', '.wav', '.flac'];
  const urlPath = new URL(url).pathname.toLowerCase();
  return extensions.find(ext => urlPath.endsWith(ext));
}

function getFilenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split('/').pop() || 'download';
  } catch {
    return 'download';
  }
}

async function getFileSize(url) {
  try {
    const response = await axios.head(url);
    const contentLength = response.headers['content-length'];
    return contentLength ? parseInt(contentLength) : null;
  } catch {
    return null;
  }
}

async function analyzeVideoUrl(url) {
  return new Promise((resolve, reject) => {
    // Enhanced yt-dlp arguments to avoid bot detection
    const args = [
      '--dump-json',
      '--no-download',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.google.com/',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '--add-header', 'Accept-Encoding:gzip, deflate',
      '--add-header', 'DNT:1',
      '--add-header', 'Connection:keep-alive',
      '--add-header', 'Upgrade-Insecure-Requests:1',
      '--sleep-interval', '2',
      '--max-sleep-interval', '8',
      '--extractor-retries', '5',
      '--fragment-retries', '5',
      '--retry-sleep', 'exp=1:10'
    ];

    // Add cookies if available (critical for avoiding 429 errors)
    if (USE_COOKIES) {
      args.push('--cookies', COOKIES_PATH);
    }

    // Add URL as the last argument
    args.push(url);

    const ytdlp = spawn('yt-dlp', args);

    let output = '';
    let error = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      error += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(output);
          resolve({
            title: info.title,
            description: info.description,
            duration: info.duration,
            uploader: info.uploader,
            thumbnail: info.thumbnail,
            formats: extractFormats(info.formats || []),
            webpage_url: info.webpage_url
          });
        } catch (parseError) {
          reject(new Error('Failed to parse video information'));
        }
      } else {
        // Enhanced error handling for YouTube bot detection
        if (error.includes('Sign in to confirm you\'re not a bot') || error.includes('429')) {
          reject(new Error('YouTube has temporarily blocked this request. This is common with shared hosting. Try again in a few minutes or use a different video URL.'));
        } else if (error.includes('Video unavailable') || error.includes('Private video')) {
          reject(new Error('This video is private, unavailable, or restricted in your region.'));
        } else {
          reject(new Error(error || 'Failed to analyze video URL'));
        }
      }
    });

    // Set timeout to prevent hanging
    setTimeout(() => {
      ytdlp.kill();
      reject(new Error('Request timeout. YouTube may be blocking requests. Try again later.'));
    }, 30000);
  });
}

function extractFormats(formats) {
  const videoFormats = [];
  const audioFormats = [];

  formats.forEach(format => {
    if (format.vcodec && format.vcodec !== 'none') {
      // Video format
      videoFormats.push({
        format_id: format.format_id,
        ext: format.ext,
        quality: format.height || 'unknown',
        filesize: format.filesize,
        fps: format.fps,
        vcodec: format.vcodec,
        acodec: format.acodec
      });
    } else if (format.acodec && format.acodec !== 'none') {
      // Audio format
      audioFormats.push({
        format_id: format.format_id,
        ext: format.ext,
        quality: format.abr || 'unknown',
        filesize: format.filesize,
        acodec: format.acodec
      });
    }
  });

  return {
    video: videoFormats,
    audio: audioFormats
  };
}

async function downloadContent(url, format, quality) {
  const outputDir = path.join(__dirname, 'downloads');
  
  // Ensure downloads directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create downloads directory:', error);
  }

  return new Promise((resolve, reject) => {
    const args = [
      '--output', `${outputDir}/%(title)s.%(ext)s`,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.google.com/',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '--add-header', 'Accept-Encoding:gzip, deflate',
      '--add-header', 'DNT:1',
      '--add-header', 'Connection:keep-alive',
      '--add-header', 'Upgrade-Insecure-Requests:1',
      '--sleep-interval', '3',
      '--max-sleep-interval', '10',
      '--extractor-retries', '5',
      '--fragment-retries', '5',
      '--retry-sleep', 'exp=1:20',
      '--throttled-rate', '100K'
    ];

    // Add cookies if available (critical for avoiding 429 errors)
    if (USE_COOKIES) {
      args.push('--cookies', COOKIES_PATH);
    }

    if (format === 'mp3') {
      args.push('--extract-audio', '--audio-format', 'mp3');
      if (quality) {
        args.push('--audio-quality', quality);
      }
    } else if (format === 'mp4') {
      args.push('--format', `best[height<=${quality}][ext=mp4]`);
    }

    // Add URL as the last argument
    args.push(url);

    const ytdlp = spawn('yt-dlp', args);

    let output = '';
    let error = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      error += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: 'Download completed successfully',
          output: output
        });
      } else {
        // Enhanced error handling for downloads
        if (error.includes('Sign in to confirm you\'re not a bot') || error.includes('429')) {
          reject(new Error('YouTube has temporarily blocked download requests. This is common with shared hosting. Please try again in a few minutes.'));
        } else if (error.includes('Video unavailable') || error.includes('Private video')) {
          reject(new Error('This video is private, unavailable, or restricted in your region.'));
        } else if (error.includes('HTTP Error 403')) {
          reject(new Error('Access denied. The video may be geo-blocked or require authentication.'));
        } else {
          reject(new Error(error || 'Download failed'));
        }
      }
    });

    // Set timeout for downloads (5 minutes)
    setTimeout(() => {
      ytdlp.kill();
      reject(new Error('Download timeout. Large files or slow connections may cause this. Try again later.'));
    }, 300000);
  });
}

// Serve React app for all other routes (only in production)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'client/build', 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ 
      message: 'Universal Video Downloader API', 
      status: 'Backend running',
      frontend: 'Start frontend with: cd client && npm start',
      devMode: 'Visit http://localhost:3000 for development'
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  if (NODE_ENV === 'development') {
    console.log(`Visit http://localhost:${PORT} to use the Universal Video Downloader`);
  } else {
    console.log(`Universal Video Downloader is running in production mode`);
  }
});
