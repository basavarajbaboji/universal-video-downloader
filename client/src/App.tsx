import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Link, Play, FileText, Settings, Cookie } from 'lucide-react';
import './App.css';

interface VideoInfo {
  type: 'video';
  title: string;
  description: string;
  duration: number;
  uploader: string;
  thumbnail: string;
  formats: {
    video: VideoFormat[];
    audio: AudioFormat[];
  };
  webpage_url: string;
}

interface FileInfo {
  type: 'file';
  url: string;
  extension: string;
  filename: string;
  fileSize: number | null;
}

interface VideoFormat {
  format_id: string;
  ext: string;
  quality: string | number;
  filesize?: number;
  fps?: number;
  vcodec: string;
  acodec: string;
}

interface AudioFormat {
  format_id: string;
  ext: string;
  quality: string | number;
  filesize?: number;
  acodec: string;
}

type ContentInfo = VideoInfo | FileInfo;

function App() {
  const [url, setUrl] = useState('');
  const [contentInfo, setContentInfo] = useState<ContentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [showCookiePopup, setShowCookiePopup] = useState(false);

  useEffect(() => {
    // Show cookie popup after 2 seconds
    const timer = setTimeout(() => {
      setShowCookiePopup(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError('');
    setContentInfo(null);

    try {
      const response = await axios.post<ContentInfo>('/api/analyze', { url: url.trim() });
      setContentInfo(response.data);
      
      // Set default format and quality
      if (response.data.type === 'video') {
        setSelectedFormat('mp4');
        if (response.data.formats.video.length > 0) {
          setSelectedQuality('720');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to analyze URL');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!contentInfo) return;

    setDownloading(true);
    setError('');

    try {
      const response = await axios.post<{success: boolean; message?: string}>('/api/download', {
        url: contentInfo.type === 'video' ? contentInfo.webpage_url : contentInfo.url,
        format: selectedFormat,
        quality: selectedQuality
      });

      if (response.data.success) {
        alert('Download started successfully!');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to start download');
    } finally {
      setDownloading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="App">
      {/* Cookie Popup */}
      {showCookiePopup && (
        <div className="cookie-popup">
          <div className="cookie-content">
            <Cookie className="cookie-icon" />
            <div className="cookie-text">
              <h3>Cookie Consent</h3>
              <p>We use cookies to enhance your experience and provide premium features. Accept cookies to access advanced download options.</p>
            </div>
            <div className="cookie-actions">
              <button 
                className="btn-secondary"
                onClick={() => setShowCookiePopup(false)}
              >
                Decline
              </button>
              <button 
                className="btn-primary"
                onClick={() => setShowCookiePopup(false)}
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container">
        <header className="header">
          <div className="logo">
            <Download className="logo-icon" />
            <h1>Universal Video Downloader</h1>
          </div>
          <p className="subtitle">Download videos and files from 1000+ websites</p>
        </header>

        <div className="main-content">
          <div className="url-input-section">
            <div className="input-group">
              <Link className="input-icon" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter video URL or direct file link..."
                className="url-input"
                onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
              />
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="analyze-btn"
              >
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message">
              <div className="error-title">⚠️ Request Failed</div>
              <div className="error-text">{error}</div>
              {error.includes('YouTube has temporarily blocked') && (
                <div className="error-help">
                  <p><strong>Why this happens:</strong> YouTube blocks requests from shared hosting to prevent abuse.</p>
                  <p><strong>Solutions:</strong></p>
                  <ul>
                    <li>Wait 5-10 minutes and try again</li>
                    <li>Try a different YouTube video</li>
                    <li>Use videos from other platforms (Vimeo, etc.)</li>
                  </ul>
                </div>
              )}
              {error.includes('Too many requests') && (
                <div className="error-help">
                  <p><strong>Rate limit reached.</strong> Please wait before making more requests.</p>
                </div>
              )}
            </div>
          )}

          {contentInfo && (
            <div className="content-info">
              {contentInfo.type === 'video' ? (
                <div className="video-info">
                  <div className="video-header">
                    <img 
                      src={contentInfo.thumbnail} 
                      alt={contentInfo.title}
                      className="thumbnail"
                    />
                    <div className="video-details">
                      <h2>{contentInfo.title}</h2>
                      <div className="video-meta">
                        <span className="uploader">{contentInfo.uploader}</span>
                        <span className="duration">
                          {formatDuration(contentInfo.duration)}
                        </span>
                      </div>
                      <p className="description">
                        {contentInfo.description?.substring(0, 200)}
                        {contentInfo.description?.length > 200 && '...'}
                      </p>
                    </div>
                  </div>

                  <div className="format-options">
                    <h3>Download Options</h3>
                    
                    <div className="format-selector">
                      <label>Format:</label>
                      <select 
                        value={selectedFormat} 
                        onChange={(e) => setSelectedFormat(e.target.value)}
                      >
                        <option value="mp4">MP4 (Video)</option>
                        <option value="mp3">MP3 (Audio Only)</option>
                      </select>
                    </div>

                    {selectedFormat === 'mp4' && contentInfo.formats.video.length > 0 && (
                      <div className="quality-selector">
                        <label>Quality:</label>
                        <select 
                          value={selectedQuality} 
                          onChange={(e) => setSelectedQuality(e.target.value)}
                        >
                          {['2160', '1440', '1080', '720', '480', '360', '240'].map(quality => (
                            <option key={quality} value={quality}>
                              {quality}p
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedFormat === 'mp3' && (
                      <div className="quality-selector">
                        <label>Audio Quality:</label>
                        <select 
                          value={selectedQuality} 
                          onChange={(e) => setSelectedQuality(e.target.value)}
                        >
                          <option value="0">Best</option>
                          <option value="2">High (192 kbps)</option>
                          <option value="5">Medium (128 kbps)</option>
                          <option value="9">Low (64 kbps)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="file-info">
                  <div className="file-header">
                    <FileText className="file-icon" />
                    <div className="file-details">
                      <h2>{contentInfo.filename}</h2>
                      <div className="file-meta">
                        <span className="file-type">
                          {contentInfo.extension.toUpperCase()} File
                        </span>
                        <span className="file-size">
                          {formatFileSize(contentInfo.fileSize)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleDownload}
                disabled={downloading}
                className="download-btn"
              >
                <Download className="btn-icon" />
                {downloading ? 'Downloading...' : 'Download'}
              </button>
            </div>
          )}
        </div>

        <footer className="footer">
          <p>Supports YouTube, Vimeo, Facebook, Instagram, TikTok, and 1000+ more websites</p>
        </footer>
      </div>
    </div>
  );
}

export default App;