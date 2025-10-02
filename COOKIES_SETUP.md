# YouTube Cookies Setup Guide

This guide helps you fix YouTube 429 "Too Many Requests" errors by setting up browser cookies.

## 🚨 Why You Need This

YouTube blocks automated requests from shared hosting providers (like Render, Heroku, etc.). Without cookies, you'll get:
- `HTTP Error 429: Too Many Requests`
- `Sign in to confirm you're not a bot`
- Failed downloads and analysis

## 📋 Quick Setup (5 minutes)

### Step 1: Install Browser Extension

**Chrome Users:**
1. Go to [Chrome Web Store](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
2. Click "Add to Chrome"

**Firefox Users:**
1. Go to [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)
2. Click "Add to Firefox"

### Step 2: Export YouTube Cookies

1. **Visit YouTube**: Go to [youtube.com](https://youtube.com)
2. **Login**: Make sure you're signed into your YouTube/Google account
3. **Export Cookies**: 
   - Click the extension icon in your browser toolbar
   - Click "Export" or "Download"
   - Save the file as `cookies.txt`

### Step 3: Add to Your Project

**For Local Development:**
```bash
# Copy cookies.txt to your project root
cp ~/Downloads/cookies.txt /path/to/universal-video-downloader/
```

**For Production (Render.com):**
1. Upload `cookies.txt` to your GitHub repository
2. In Render dashboard, add environment variable:
   - Key: `COOKIES_PATH`
   - Value: `/app/cookies.txt`

### Step 4: Verify Setup

Restart your server and look for this message:
```
✅ YouTube cookies found - 429 errors should be reduced
```

If you see this instead:
```
⚠️  No cookies.txt found - YouTube may return 429 errors
```

Then your cookies file is missing or in the wrong location.

## 🔒 Security Notes

- **Never commit cookies.txt to public repositories**
- Cookies contain your login session data
- `cookies.txt` is already in `.gitignore`
- For production, use environment variables or secure file storage

## 🔄 Cookie Maintenance

- **Expiration**: Cookies expire after ~30-90 days
- **Refresh**: Re-export cookies when you get 429 errors again
- **Multiple Accounts**: You can use cookies from any YouTube account

## 🐛 Troubleshooting

### Still Getting 429 Errors?

1. **Check Cookie Format**: Make sure cookies.txt is in Netscape format
2. **Re-export**: Try exporting fresh cookies
3. **Different Account**: Use cookies from a different Google account
4. **Wait**: Sometimes you need to wait 10-15 minutes after getting blocked

### Cookie File Issues

```bash
# Check if cookies file exists
ls -la cookies.txt

# Check file format (should start with # Netscape HTTP Cookie File)
head -1 cookies.txt
```

### Production Deployment Issues

1. **Render.com**: Make sure `COOKIES_PATH` environment variable is set
2. **File Upload**: Ensure cookies.txt is in your repository
3. **Build Logs**: Check deployment logs for cookie-related messages

## 📞 Need Help?

If you're still having issues:
1. Check the main [README.md](README.md) troubleshooting section
2. Verify your cookies.txt file format
3. Try using cookies from a different browser/account

## ⚖️ Legal Notice

Only use cookies from your own accounts. Respect YouTube's Terms of Service and use this tool responsibly.
