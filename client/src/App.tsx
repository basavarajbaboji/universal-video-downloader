import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Link, Play, FileText, Settings, Cookie, History, X, Zap, ChevronDown, ChevronUp } from 'lucide-react';
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

interface DownloadRecord {
  id: string;
  title: string;
  url: string;
  format: string;
  quality: string;
  filename: string;
  downloadUrl: string;
  timestamp: number;
  status: 'completed' | 'failed';
  fileSize?: number;
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
  const [downloadHistory, setDownloadHistory] = useState<DownloadRecord[]>([]);
  const [showDownloadHistory, setShowDownloadHistory] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [currentDownloadFilename, setCurrentDownloadFilename] = useState('');
  const [speedBoostEnabled, setSpeedBoostEnabled] = useState(true);
  const [parallelConnections, setParallelConnections] = useState(4);
  const [maxSpeed, setMaxSpeed] = useState(0); // 0 = unlimited
  const [showSpeedSettings, setShowSpeedSettings] = useState(false);
  const [downloadAbortController, setDownloadAbortController] = useState<AbortController | null>(null);
  const [useSimpleDownload, setUseSimpleDownload] = useState(false);

  useEffect(() => {
    // Show cookie popup after 2 seconds
    const timer = setTimeout(() => {
      setShowCookiePopup(true);
    }, 2000);

    // Load download history from localStorage
    const savedHistory = localStorage.getItem('downloadHistory');
    if (savedHistory) {
      try {
        setDownloadHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Failed to load download history:', error);
      }
    }

    return () => clearTimeout(timer);
  }, []);

  // Save download history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('downloadHistory', JSON.stringify(downloadHistory));
  }, [downloadHistory]);

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

  const resetProgressState = () => {
    setDownloadProgress(0);
    setDownloadSpeed(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setCurrentDownloadFilename('');
    setDownloadAbortController(null);
  };

  const cancelDownload = () => {
    if (downloadAbortController) {
      downloadAbortController.abort();
    }
    setDownloading(false);
    resetProgressState();
  };

  const handleDownload = async () => {
    if (!contentInfo) return;

    setDownloading(true);
    setError('');
    resetProgressState();

    try {
      // First, initiate the download on the server
      const response = await axios.post<{
        success: boolean;
        message?: string;
        filename?: string;
        downloadUrl?: string;
      }>('/api/download', {
        url: contentInfo.type === 'video' ? contentInfo.webpage_url : contentInfo.url,
        format: selectedFormat,
        quality: selectedQuality
      });

      if (response.data.success && response.data.downloadUrl) {
        const filename = response.data.filename || 'download';
        setCurrentDownloadFilename(filename);

        // Choose download method based on settings
        if (useSimpleDownload) {
          console.log('Using simple download method');
          await simpleDownload(response.data.downloadUrl, filename);
        } else {
          // Start progress tracking by fetching the file with progress monitoring
          try {
            await trackDownloadProgress(response.data.downloadUrl, filename);
          } catch (error) {
            console.error('Progress tracking failed, using simple download:', error);
            // Fallback to simple download
            await simpleDownload(response.data.downloadUrl, filename);
          }
        }

        // Add to download history
        const downloadRecord: DownloadRecord = {
          id: Date.now().toString(),
          title: contentInfo.type === 'video' ? contentInfo.title : contentInfo.filename,
          url: contentInfo.type === 'video' ? contentInfo.webpage_url : contentInfo.url,
          format: selectedFormat,
          quality: selectedQuality,
          filename: filename,
          downloadUrl: response.data.downloadUrl,
          timestamp: Date.now(),
          status: 'completed',
          fileSize: totalBytes || (contentInfo.type === 'file' ? contentInfo.fileSize || undefined : undefined)
        };
        
        setDownloadHistory(prev => [downloadRecord, ...prev]);
        
        alert(`Download completed: ${filename}`);
      } else {
        console.log('Download response:', response.data);
        alert(response.data.message || 'Download completed successfully!');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to start download');
    } finally {
      setDownloading(false);
      resetProgressState();
    }
  };

  const trackDownloadProgress = async (downloadUrl: string, filename: string) => {
    const startTime = Date.now();
    
    try {
      console.log('🔄 Starting progress tracking for:', filename);
      console.log('📁 Download URL:', downloadUrl);
      
      // Create abort controller for this download
      const controller = new AbortController();
      setDownloadAbortController(controller);

      // Check if server supports range requests for parallel downloading
      console.log('🔍 Checking server capabilities...');
      const headResponse = await fetch(downloadUrl, { 
        method: 'HEAD',
        signal: controller.signal,
        mode: 'cors',
        credentials: 'same-origin'
      });
      
      console.log('📊 Head response status:', headResponse.status);
      console.log('📊 Head response headers:', Object.fromEntries(headResponse.headers.entries()));
      
      const acceptsRanges = headResponse.headers.get('Accept-Ranges') === 'bytes';
      const contentLength = headResponse.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength) : 0;
      
      console.log('📏 Content length:', total, 'bytes');
      console.log('🔄 Accepts ranges:', acceptsRanges);
      
      setTotalBytes(total);

      if (speedBoostEnabled && acceptsRanges && total > 1024 * 1024) { // Only for files > 1MB
        console.log('⚡ Using speed boost mode');
        await downloadWithSpeedBoost(downloadUrl, filename, total, startTime, controller);
      } else {
        console.log('📥 Using sequential download');
        await downloadSequentially(downloadUrl, filename, total, startTime, controller);
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('❌ Download cancelled by user');
        return;
      }
      console.error('❌ Progress tracking error:', error);
      console.log('🔄 Falling back to simple download');
      // Fallback to simple download
      await simpleDownload(downloadUrl, filename);
    }
  };

  const downloadWithSpeedBoost = async (downloadUrl: string, filename: string, total: number, startTime: number, controller: AbortController) => {
    const chunkSize = Math.ceil(total / parallelConnections);
    const chunks: (Uint8Array | null)[] = new Array(parallelConnections).fill(null);
    let totalDownloaded = 0;

    // Create parallel download promises
    const downloadPromises = Array.from({ length: parallelConnections }, async (_, index) => {
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize - 1, total - 1);
      
      if (start >= total) return;

      const response = await fetch(downloadUrl, {
        headers: {
          'Range': `bytes=${start}-${end}`,
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Chunk ${index} failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error(`Failed to get reader for chunk ${index}`);

      const chunkData: Uint8Array[] = [];
      let chunkDownloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkData.push(value);
        chunkDownloaded += value.length;
        
        // Update total progress
        totalDownloaded += value.length;
        setDownloadedBytes(totalDownloaded);

        // Calculate progress and speed
        const progress = (totalDownloaded / total) * 100;
        setDownloadProgress(Math.round(progress));

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > 0) {
          const speed = totalDownloaded / elapsed;
          setDownloadSpeed(speed);
        }
      }

      // Combine chunk data
      const totalChunkSize = chunkData.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedChunk = new Uint8Array(totalChunkSize);
      let offset = 0;
      
      for (const chunk of chunkData) {
        combinedChunk.set(chunk, offset);
        offset += chunk.length;
      }
      
      chunks[index] = combinedChunk;
    });

    // Wait for all chunks to complete
    await Promise.all(downloadPromises);

    // Combine all chunks in order
    const validChunks = chunks.filter((chunk): chunk is Uint8Array => chunk !== null);
    const blob = new Blob(validChunks);
    triggerBrowserDownload(blob, filename);
  };

  const downloadSequentially = async (downloadUrl: string, filename: string, total: number, startTime: number, controller: AbortController) => {
    const response = await fetch(downloadUrl, {
      headers: {
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response stream');
    }

    const chunks: Uint8Array[] = [];
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      downloaded += value.length;
      setDownloadedBytes(downloaded);

      // Calculate progress percentage
      if (total > 0) {
        const progress = (downloaded / total) * 100;
        setDownloadProgress(Math.round(progress));
      }

      // Calculate download speed (bytes per second)
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 0) {
        const speed = downloaded / elapsed;
        setDownloadSpeed(speed);
      }
    }

    const blob = new Blob(chunks);
    triggerBrowserDownload(blob, filename);
  };

  const triggerBrowserDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  };

  // Simple download method for testing
  const simpleDownload = async (downloadUrl: string, filename: string) => {
    try {
      console.log('📥 Starting simple download for:', filename);
      setDownloadProgress(10);
      
      const response = await fetch(downloadUrl, {
        mode: 'cors',
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      console.log('📊 Response status:', response.status);
      setDownloadProgress(30);
      
      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength) : 0;
      setTotalBytes(total);
      
      console.log('📏 File size:', total, 'bytes');
      setDownloadProgress(50);
      
      const blob = await response.blob();
      setDownloadProgress(90);
      
      console.log('💾 Blob created, size:', blob.size, 'bytes');
      triggerBrowserDownload(blob, filename);
      
      setDownloadProgress(100);
      console.log('✅ Simple download completed:', filename);
    } catch (error) {
      console.error('❌ Simple download failed:', error);
      console.log('🔄 Using final fallback: window.open');
      // Final fallback
      window.open(downloadUrl, '_blank');
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

  const formatSpeed = (bytesPerSecond: number) => {
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(1024));
    return Math.round(bytesPerSecond / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
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
          <button 
            className="history-btn"
            onClick={() => setShowDownloadHistory(!showDownloadHistory)}
          >
            <History className="history-icon" />
            Downloads ({downloadHistory.length})
          </button>
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
                {loading ? (
                  <>
                    <div className="loading-spinner"></div>
                    Analyzing...
                  </>
                ) : 'Analyze'}
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

                    {/* Speed Boost Settings */}
                    <div className="speed-boost-section">
                      <button 
                        className="speed-boost-toggle"
                        onClick={() => setShowSpeedSettings(!showSpeedSettings)}
                      >
                        <Zap className="boost-icon" />
                        <span>Speed Boost Settings</span>
                        {showSpeedSettings ? <ChevronUp /> : <ChevronDown />}
                      </button>
                      
                      {showSpeedSettings && (
                        <div className="speed-settings">
                          <div className="speed-setting">
                            <label className="speed-label">
                              <input
                                type="checkbox"
                                checked={speedBoostEnabled}
                                onChange={(e) => setSpeedBoostEnabled(e.target.checked)}
                              />
                              Enable Speed Boost (Parallel Downloads)
                            </label>
                            <span className="speed-description">
                              Downloads files in multiple parallel chunks for faster speeds
                            </span>
                          </div>
                          
                          {speedBoostEnabled && (
                            <>
                              <div className="speed-setting">
                                <label className="speed-label">
                                  Parallel Connections: {parallelConnections}
                                </label>
                                <input
                                  type="range"
                                  min="1"
                                  max="8"
                                  value={parallelConnections}
                                  onChange={(e) => setParallelConnections(parseInt(e.target.value))}
                                  className="speed-slider"
                                />
                                <span className="speed-description">
                                  More connections = faster downloads (1-8 connections)
                                </span>
                              </div>
                            </>
                          )}
                          
                          <div className="speed-setting">
                            <label className="speed-label">
                              <input
                                type="checkbox"
                                checked={useSimpleDownload}
                                onChange={(e) => setUseSimpleDownload(e.target.checked)}
                              />
                              Use Simple Download (Testing Mode)
                            </label>
                            <span className="speed-description">
                              Skip progress tracking and use basic download method
                            </span>
                          </div>

                          <div className="speed-info">
                            <div className="boost-indicator">
                              <Zap className="boost-icon-small" />
                              <span>
                                {useSimpleDownload 
                                  ? 'Simple Mode: Basic download'
                                  : speedBoostEnabled 
                                    ? `Boost Mode: ${parallelConnections}x connections` 
                                    : 'Standard Mode: Single connection'
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
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

              {downloading ? (
                <div className="download-progress-container">
                  <div className="progress-info">
                    <div className="progress-text">
                      <span className="progress-label">
                        {speedBoostEnabled && <Zap className="boost-icon-small" />}
                        Downloading: {currentDownloadFilename}
                        {speedBoostEnabled && <span className="boost-badge">{parallelConnections}x</span>}
                      </span>
                      <span className="progress-percentage">{downloadProgress}%</span>
                    </div>
                    <div className="progress-details">
                      <span className="progress-size">
                        {formatFileSize(downloadedBytes)} / {totalBytes > 0 ? formatFileSize(totalBytes) : 'Unknown'}
                      </span>
                      {downloadSpeed > 0 && (
                        <span className="progress-speed">{formatSpeed(downloadSpeed)}</span>
                      )}
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${speedBoostEnabled ? 'speed-boost' : ''}`}
                      style={{ width: `${downloadProgress}%` }}
                    ></div>
                  </div>
                  <button
                    onClick={cancelDownload}
                    className="cancel-download-btn"
                  >
                    <X className="cancel-icon" />
                    Cancel Download
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="download-btn"
                >
                  <Download className="btn-icon" />
                  Download
                </button>
              )}
            </div>
          )}
        </div>

        {/* Download History Panel */}
        {showDownloadHistory && (
          <div className="download-history-panel">
            <div className="history-header">
              <h2>Download History</h2>
              <button 
                className="close-history-btn"
                onClick={() => setShowDownloadHistory(false)}
              >
                <X className="close-icon" />
              </button>
            </div>
            
            {downloadHistory.length === 0 ? (
              <div className="no-downloads">
                <p>No downloads yet. Start downloading videos to see them here!</p>
              </div>
            ) : (
              <div className="history-list">
                {downloadHistory.map((record) => (
                  <div key={record.id} className="history-item">
                    <div className="history-info">
                      <h3 className="history-title">{record.title}</h3>
                      <div className="history-meta">
                        <span className="history-format">{record.format.toUpperCase()}</span>
                        {record.quality && <span className="history-quality">{record.quality}p</span>}
                        {record.fileSize && (
                          <span className="history-size">{formatFileSize(record.fileSize)}</span>
                        )}
                        <span className="history-date">
                          {new Date(record.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="history-url">{record.url}</div>
                    </div>
                    <div className="history-actions">
                      <button
                        className="redownload-btn"
                        onClick={() => window.open(record.downloadUrl, '_blank')}
                      >
                        <Download className="download-icon" />
                        Re-download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {downloadHistory.length > 0 && (
              <div className="history-footer">
                <button
                  className="clear-history-btn"
                  onClick={() => {
                    setDownloadHistory([]);
                    localStorage.removeItem('downloadHistory');
                  }}
                >
                  Clear All History
                </button>
              </div>
            )}
          </div>
        )}

        <footer className="footer">
          <p>Supports YouTube, Vimeo, Facebook, Instagram, TikTok, and 1000+ more websites</p>
        </footer>
      </div>
    </div>
  );
}

export default App;