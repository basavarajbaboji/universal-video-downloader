const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const { existsSync } = require('fs');
const ytdlp = require('yt-dlp-exec');

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Cookie configuration
const COOKIES_PATH = process.env.COOKIES_PATH || path.join(__dirname, 'cookies.txt');
const USE_COOKIES = existsSync(COOKIES_PATH);

// URL analysis cache to speed up repeated requests
const analysisCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Clean up expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of analysisCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      analysisCache.delete(key);
    }
  }
  console.log(`Cache cleanup: ${analysisCache.size} entries remaining`);
}, 5 * 60 * 1000);

if (USE_COOKIES) {
  console.log('✓ Cookies file found - YouTube 429 errors should be reduced');
} else {
  console.log('⚠ No cookies file found - may encounter YouTube 429 errors');
  console.log('  Create cookies.txt or set COOKIES_PATH environment variable');
}

const app = express();

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
    const { url, cookies } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Create cache key
    const cacheKey = `${url}_${cookies ? 'with_cookies' : 'no_cookies'}`;
    
    // Check cache first
    const cached = analysisCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('✓ Returning cached analysis for:', url.substring(0, 50) + '...');
      return res.json(cached.data);
    }

    // Check if it's a direct file URL
    const fileExtension = getFileExtension(url);
    if (fileExtension) {
      const result = {
        type: 'file',
        url: url,
        extension: fileExtension,
        filename: getFilenameFromUrl(url),
        fileSize: await getFileSize(url)
      };
      
      // Cache file analysis
      analysisCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return res.json(result);
    }

    console.log('⚡ Fast analyzing video URL:', url.substring(0, 50) + '...');
    
    // Use yt-dlp to analyze video URL
    const videoInfo = await analyzeVideoUrl(url, cookies);
    
    const result = {
      type: 'video',
      ...videoInfo
    };
    
    // Cache video analysis
    analysisCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    res.json(result);

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
    const { url, format, quality, cookies } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const downloadResult = await downloadContent(url, format, quality, cookies);
    
    res.json(downloadResult);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Failed to download content',
      message: error.message 
    });
  }
});

// Handle CORS preflight for download endpoint
app.options('/api/download-file/:filename', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range');
  res.status(200).end();
});

// HEAD handler for download endpoint to support range requests
app.head('/api/download-file/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'downloads', filename);
    
    // Security check: ensure file is in downloads directory
    if (!filePath.startsWith(path.join(__dirname, 'downloads'))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const stats = require('fs').statSync(filePath);
    const fileExtension = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (fileExtension === '.mp4') {
      contentType = 'video/mp4';
    } else if (fileExtension === '.mp3') {
      contentType = 'audio/mpeg';
    } else if (fileExtension === '.webm') {
      contentType = 'video/webm';
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range');
    res.status(200).end();
    
  } catch (error) {
    console.error('HEAD request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// File download endpoint - serves actual files for browser download
app.get('/api/download-file/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'downloads', filename);
    
    // Security check: ensure file is in downloads directory
    if (!filePath.startsWith(path.join(__dirname, 'downloads'))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set proper headers for download
    const fileExtension = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (fileExtension === '.mp4') {
      contentType = 'video/mp4';
    } else if (fileExtension === '.mp3') {
      contentType = 'audio/mpeg';
    } else if (fileExtension === '.webm') {
      contentType = 'video/webm';
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range');
    
    // Stream the file
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error downloading file' });
        }
      } else {
        console.log(`File downloaded: ${filename}`);
        
        // Optional: Clean up file after download (with delay)
        setTimeout(() => {
          fs.unlink(filePath).catch(err => {
            console.log(`Could not delete file ${filename}:`, err.message);
          });
        }, 30000); // Delete after 30 seconds
      }
    });
    
  } catch (error) {
    console.error('File serving error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Helper functions
function validateCookies(cookiesString) {
  if (!cookiesString || typeof cookiesString !== 'string') {
    return false;
  }
  
  // Check if it looks like Netscape cookie format
  const lines = cookiesString.trim().split('\n');
  
  // Should have header comment or cookie entries
  if (lines.length === 0) return false;
  
  // Look for valid cookie entries (tab-separated values)
  const cookieLines = lines.filter(line => 
    !line.startsWith('#') && 
    line.trim().length > 0 &&
    line.split('\t').length >= 6
  );
  
  return cookieLines.length > 0;
}

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

async function analyzeVideoUrl(url, userCookies) {
  try {
    const options = {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      referer: 'https://www.google.com/',
      addHeader: [
        'Accept-Language:en-US,en;q=0.9',
        'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'DNT:1',
        'Connection:keep-alive'
      ],
      sleepInterval: 0,
      maxSleepInterval: 1,
      extractorRetries: 1,
      fragmentRetries: 1,
      socketTimeout: 10,
      // Speed optimization flags
      noPlaylist: true,
      playlistEnd: 1
    };

    // Priority: user-provided cookies > file cookies > no cookies
    if (userCookies && validateCookies(userCookies)) {
      // Write temporary cookie file for this request
      const tempCookiePath = path.join(__dirname, `temp_cookies_${Date.now()}.txt`);
      await fs.writeFile(tempCookiePath, userCookies);
      options.cookies = tempCookiePath;
      
      try {
        const info = await ytdlp(url, options);
        
        // Clean up temp file
        await fs.unlink(tempCookiePath).catch(() => {});
        
        return {
          title: info.title,
          description: info.description,
          duration: info.duration,
          uploader: info.uploader,
          thumbnail: info.thumbnail,
          formats: extractFormats(info.formats || []),
          webpage_url: info.webpage_url
        };
      } catch (error) {
        // Clean up temp file on error
        await fs.unlink(tempCookiePath).catch(() => {});
        throw error;
      }
    } else if (USE_COOKIES) {
      // Fallback to file cookies
      options.cookies = COOKIES_PATH;
      const info = await ytdlp(url, options);
      
      return {
        title: info.title,
        description: info.description,
        duration: info.duration,
        uploader: info.uploader,
        thumbnail: info.thumbnail,
        formats: extractFormats(info.formats || []),
        webpage_url: info.webpage_url
      };
    } else {
      // No cookies available
      const info = await ytdlp(url, options);
      
      return {
        title: info.title,
        description: info.description,
        duration: info.duration,
        uploader: info.uploader,
        thumbnail: info.thumbnail,
        formats: extractFormats(info.formats || []),
        webpage_url: info.webpage_url
      };
    }
  } catch (error) {
    // Enhanced error handling for YouTube bot detection
    const errorMessage = error.message || error.toString();
    
    if (errorMessage.includes('Sign in to confirm you\'re not a bot') || errorMessage.includes('429')) {
      throw new Error('YouTube has temporarily blocked this request. Please provide valid YouTube cookies or try again later.');
    } else if (errorMessage.includes('Video unavailable') || errorMessage.includes('Private video')) {
      throw new Error('This video is private, unavailable, or restricted in your region.');
    } else {
      throw new Error(errorMessage || 'Failed to analyze video URL');
    }
  }
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

async function downloadContent(url, format, quality, userCookies) {
  const outputDir = path.join(__dirname, 'downloads');
  
  // Ensure downloads directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create downloads directory:', error);
  }

  try {
    const options = {
      output: `${outputDir}/%(title)s.%(ext)s`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      referer: 'https://www.google.com/',
      addHeader: [
        'Accept-Language:en-US,en;q=0.9',
        'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding:gzip, deflate',
        'DNT:1',
        'Connection:keep-alive',
        'Upgrade-Insecure-Requests:1'
      ],
      sleepInterval: 3,
      maxSleepInterval: 10,
      extractorRetries: 5,
      fragmentRetries: 5,
      retrySleep: 'exp=1:20',
      throttledRate: '100K'
    };

    // Priority: user-provided cookies > file cookies > no cookies
    let tempCookiePath = null;
    
    if (userCookies && validateCookies(userCookies)) {
      // Write temporary cookie file for this request
      tempCookiePath = path.join(__dirname, `temp_cookies_${Date.now()}.txt`);
      await fs.writeFile(tempCookiePath, userCookies);
      options.cookies = tempCookiePath;
    } else if (USE_COOKIES) {
      // Fallback to file cookies
      options.cookies = COOKIES_PATH;
    }

    // Set format-specific options
    if (format === 'mp3') {
      options.extractAudio = true;
      options.audioFormat = 'mp3';
      if (quality) {
        options.audioQuality = quality;
      }
    } else if (format === 'mp4') {
      options.format = `best[height<=${quality}][ext=mp4]`;
    }

    try {
      const result = await ytdlp(url, options);
      
      // Clean up temp file if created
      if (tempCookiePath) {
        await fs.unlink(tempCookiePath).catch(() => {});
      }
      
      // Find the downloaded file - improved logic
      const files = await fs.readdir(outputDir);
      console.log('Files in downloads directory:', files);
      
      // Sort files by modification time (newest first)
      const filesWithStats = await Promise.all(
        files.map(async file => {
          const filePath = path.join(outputDir, file);
          const stats = await fs.stat(filePath);
          return { file, mtime: stats.mtime };
        })
      );
      
      const sortedFiles = filesWithStats
        .sort((a, b) => b.mtime - a.mtime)
        .map(item => item.file);
      
      // Find the most recently downloaded file
      const downloadedFile = sortedFiles.find(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp4', '.mp3', '.webm', '.mkv', '.avi', '.m4a', '.wav'].includes(ext);
      }) || sortedFiles[0]; // Fallback to newest file
      
      if (downloadedFile) {
        return {
          success: true,
          message: 'Download completed successfully',
          filename: downloadedFile,
          downloadUrl: `/api/download-file/${encodeURIComponent(downloadedFile)}`,
          output: result
        };
      } else {
        return {
          success: true,
          message: 'Download completed but file not found in expected location',
          output: result
        };
      }
    } catch (error) {
      // Clean up temp file on error
      if (tempCookiePath) {
        await fs.unlink(tempCookiePath).catch(() => {});
      }
      throw error;
    }
  } catch (error) {
    // Enhanced error handling for downloads
    const errorMessage = error.message || error.toString();
    
    if (errorMessage.includes('Sign in to confirm you\'re not a bot') || errorMessage.includes('429')) {
      throw new Error('YouTube has temporarily blocked download requests. Please provide valid YouTube cookies or try again later.');
    } else if (errorMessage.includes('Video unavailable') || errorMessage.includes('Private video')) {
      throw new Error('This video is private, unavailable, or restricted in your region.');
    } else if (errorMessage.includes('HTTP Error 403')) {
      throw new Error('Access denied. The video may be geo-blocked or require authentication.');
    } else {
      throw new Error(errorMessage || 'Download failed');
    }
  }
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
