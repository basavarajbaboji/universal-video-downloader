const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Serve static files from React build (only in production)
const buildPath = path.join(__dirname, 'client/build');
if (require('fs').existsSync(buildPath)) {
  app.use(express.static(buildPath));
}

// URL analysis endpoint
app.post('/api/analyze', async (req, res) => {
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
app.post('/api/download', async (req, res) => {
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
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-download',
      url
    ]);

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
        reject(new Error(error || 'Failed to analyze video URL'));
      }
    });
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
      url
    ];

    if (format === 'mp3') {
      args.push('--extract-audio', '--audio-format', 'mp3');
      if (quality) {
        args.push('--audio-quality', quality);
      }
    } else if (format === 'mp4') {
      args.push('--format', `best[height<=${quality}][ext=mp4]`);
    }

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
        reject(new Error(error || 'Download failed'));
      }
    });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to use the Universal Video Downloader`);
});
