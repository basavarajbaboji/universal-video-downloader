# Deployment Guide for Render.com

## Prerequisites

1. GitHub account with your project repository
2. Render.com account (free tier available)

## Deployment Steps

### Method 1: Using Render Dashboard (Recommended)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/universal-video-downloader.git
   git push -u origin main
   ```

2. **Connect to Render**
   - Go to [render.com](https://render.com)
   - Sign up/Login with GitHub
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

3. **Configure Service**
   - **Name**: `universal-video-downloader`
   - **Environment**: `Node`
   - **Build Command**: `npm run render-build`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for better performance)

4. **Environment Variables**
   - `NODE_ENV`: `production`
   - `NPM_CONFIG_PRODUCTION`: `false`

5. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (5-10 minutes)

### Method 2: Using render.yaml (Infrastructure as Code)

1. **Push code with render.yaml**
   ```bash
   git add .
   git commit -m "Add Render configuration"
   git push
   ```

2. **Create Blueprint**
   - Go to Render Dashboard
   - Click "Blueprints"
   - Connect your repository
   - Render will automatically detect `render.yaml`

## Important Notes

### yt-dlp Installation
Render will automatically install yt-dlp during the build process via:
```dockerfile
RUN pip3 install yt-dlp
```

### Environment Variables
Set these in Render Dashboard:
- `NODE_ENV=production`
- `NPM_CONFIG_PRODUCTION=false` (needed to install dev dependencies for build)

### Build Process
1. Install backend dependencies
2. Install frontend dependencies
3. Build React app
4. Serve static files from Express

### Limitations on Free Tier
- **Spin down**: Service sleeps after 15 minutes of inactivity
- **Cold starts**: First request after sleep takes ~30 seconds
- **Build time**: Limited to 500 build minutes/month
- **Bandwidth**: 100GB/month

### Upgrading for Production
Consider upgrading to paid plan for:
- No spin down
- Faster builds
- More bandwidth
- Custom domains
- SSL certificates

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Ensure all dependencies are in package.json
- Verify Node.js version compatibility

### yt-dlp Not Found
- Dockerfile includes Python and pip installation
- yt-dlp is installed during container build

### YouTube Bot Detection (HTTP 429)
**Common on shared hosting like Render's free tier**

**Solutions Implemented:**
- Enhanced user-agent and HTTP headers
- Request throttling and retry logic
- Rate limiting (10 requests per 5 minutes)
- Better error messages for users

**User Guidance:**
- Wait 5-10 minutes between failed attempts
- Try different YouTube videos
- Use other platforms (Vimeo, etc.) when possible

### CORS Issues
- Server is configured for production CORS
- Frontend and backend are served from same domain

### Rate Limiting Errors
- API endpoints limited to 10 requests per 5 minutes per IP
- Prevents overwhelming YouTube's servers
- Users see helpful error messages with retry guidance

### Slow Performance
- Free tier has limited resources
- Consider upgrading to paid plan for:
  - Dedicated IP (reduces bot detection)
  - Better performance
  - No cold starts

## Custom Domain (Paid Plans)
1. Go to service settings
2. Add custom domain
3. Update DNS records as instructed
4. SSL certificate is automatically provisioned

## Monitoring
- Check service logs in Render dashboard
- Monitor performance and errors
- Set up alerts for downtime

Your Universal Video Downloader will be available at:
`https://your-service-name.onrender.com`
