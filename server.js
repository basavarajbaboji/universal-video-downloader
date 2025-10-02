const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const { existsSync } = require('fs');
const ytdlp = require('yt-dlp-exec');
const { spawn } = require('child_process');

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
    const { url, cookies } = req.body;
    
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
    const videoInfo = await analyzeVideoUrl(url, cookies);
    
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

// Streaming download endpoint - streams video directly without saving to disk
app.get('/api/stream-download', apiLimiter, async (req, res) => {
  try {
    const { url, format = 'mp4', quality = '720', cookies, resumeFrom = '0' } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate cookies if provided
    let tempCookiePath = null;
    if (cookies && validateCookies(cookies)) {
      tempCookiePath = path.join(__dirname, `temp_cookies_${Date.now()}.txt`);
      await fs.writeFile(tempCookiePath, cookies);
    }

    // Generate filename based on URL and format
    const timestamp = Date.now();
    const filename = `video-${timestamp}.${format}`;
    
    // Handle Range requests for resumable downloads
    const resumeFromByte = parseInt(resumeFrom) || 0;
    const isRangeRequest = resumeFromByte > 0;
    
    // Set headers for streaming download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    
    if (isRangeRequest) {
      res.setHeader('Content-Range', `bytes ${resumeFromByte}-*/*`);
      res.status(206); // Partial Content
    } else {
      res.setHeader('Transfer-Encoding', 'chunked');
    }
    
    if (format === 'mp4') {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (format === 'mp3') {
      res.setHeader('Content-Type', 'audio/mpeg');
    } else if (format === 'webm') {
      res.setHeader('Content-Type', 'video/webm');
    }

    // Build yt-dlp command for streaming
    const args = [
      '--no-warnings',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.google.com/',
      '--sleep-interval', '2',
      '--max-sleep-interval', '5',
      '--extractor-retries', '3',
      '--fragment-retries', '3',
      '-o', '-' // Output to stdout for streaming
    ];

    // Add cookies if available
    if (tempCookiePath) {
      args.push('--cookies', tempCookiePath);
    } else if (USE_COOKIES) {
      args.push('--cookies', COOKIES_PATH);
    }

    // Add format-specific options
    if (format === 'mp3') {
      args.push('--extract-audio', '--audio-format', 'mp3');
      if (quality && quality !== 'best') {
        args.push('--audio-quality', quality);
      }
    } else if (format === 'mp4') {
      args.push('--format', `best[height<=${quality}][ext=mp4]/best[ext=mp4]/best`);
    } else {
      args.push('--format', 'best');
    }

    args.push(url);

    if (isRangeRequest) {
      console.log(`Resuming stream download: ${filename} from byte ${resumeFromByte}`);
    } else {
      console.log(`Starting stream download: ${filename}`);
    }
    
    // Spawn yt-dlp process
    const ytdlpProcess = spawn('yt-dlp', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let downloadStarted = false;
    let totalBytes = 0;

    // Handle stdout (video data)
    ytdlpProcess.stdout.on('data', (chunk) => {
      if (!downloadStarted) {
        downloadStarted = true;
        console.log(`Stream started for: ${filename}`);
      }
      totalBytes += chunk.length;
      res.write(chunk);
    });

    // Handle stderr (progress info)
    ytdlpProcess.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Extract progress information if available
      if (output.includes('%')) {
        const progressMatch = output.match(/(\d+\.?\d*)%/);
        if (progressMatch) {
          // Could send progress via Server-Sent Events in future
          console.log(`Progress: ${progressMatch[1]}%`);
        }
      }
      
      // Log other info (but don't send to client to avoid corrupting stream)
      if (output.includes('ERROR') || output.includes('WARNING')) {
        console.error('yt-dlp:', output.trim());
      }
    });

    // Handle process completion
    ytdlpProcess.on('close', async (code) => {
      console.log(`Stream finished for ${filename}. Code: ${code}, Bytes: ${totalBytes}`);
      
      // Clean up temp cookie file
      if (tempCookiePath) {
        await fs.unlink(tempCookiePath).catch(() => {});
      }
      
      if (code === 0) {
        res.end();
      } else {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream download failed' });
        } else {
          res.end();
        }
      }
    });

    // Handle process errors
    ytdlpProcess.on('error', async (error) => {
      console.error('yt-dlp process error:', error);
      
      // Clean up temp cookie file
      if (tempCookiePath) {
        await fs.unlink(tempCookiePath).catch(() => {});
      }
      
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start stream download' });
      } else {
        res.end();
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      console.log(`Client disconnected, killing stream for: ${filename}`);
      ytdlpProcess.kill('SIGTERM');
    });

  } catch (error) {
    console.error('Stream download error:', error);
    res.status(500).json({ 
      error: 'Failed to start stream download',
      message: error.message 
    });
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
      sleepInterval: 2,
      maxSleepInterval: 8,
      extractorRetries: 5,
      fragmentRetries: 5,
      retrySleep: 'exp=1:10'
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
      
      // Find the downloaded file
      const files = await fs.readdir(outputDir);
      const downloadedFile = files.find(file => 
        file.includes(url.split('/').pop()?.split('?')[0] || 'download') ||
        file.includes('video') || file.includes('audio')
      );
      
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
