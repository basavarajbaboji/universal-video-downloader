# YouTube Bot Detection & Troubleshooting Guide

## Common YouTube Errors

### 1. HTTP Error 429: Too Many Requests
**Error Message:** `WARNING: [youtube] Unable to download webpage: HTTP Error 429: Too Many Requests`

**Causes:**
- YouTube's rate limiting triggered
- Too many requests from the same IP address
- Shared hosting IP addresses being flagged

**Solutions:**
- Wait 5-10 minutes before trying again
- Try different video URLs
- The app now includes automatic retry logic
- Rate limiting is implemented (10 requests per 5 minutes per IP)

### 2. Bot Detection Error
**Error Message:** `Sign in to confirm you're not a bot`

**Causes:**
- YouTube's anti-bot measures activated
- Suspicious request patterns detected
- Missing or incorrect browser headers

**Solutions Implemented:**
- Real browser user-agent strings
- Proper HTTP headers (Accept, Referer, etc.)
- Request throttling and delays
- Exponential backoff retry logic

### 3. Video Unavailable Errors
**Error Messages:**
- `Video unavailable`
- `Private video`
- `This video is not available in your country`

**Solutions:**
- Check if video is actually public
- Try different videos from the same channel
- Some content may be geo-restricted

## Technical Improvements Made

### 1. Enhanced HTTP Headers
```javascript
'--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
'--referer', 'https://www.google.com/'
'--add-header', 'Accept-Language:en-US,en;q=0.9'
'--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9'
'--add-header', 'DNT:1'
'--add-header', 'Connection:keep-alive'
```

### 2. Request Throttling
```javascript
'--sleep-interval', '1'           // Min 1 second between requests
'--max-sleep-interval', '5'       // Max 5 seconds between requests
'--throttled-rate', '100K'        // Limit download speed
```

### 3. Retry Logic
```javascript
'--extractor-retries', '3'        // Retry failed extractions
'--fragment-retries', '3'         // Retry failed fragments
'--retry-sleep', 'linear=1::2'    // Progressive retry delays
```

### 4. Rate Limiting
- 10 API requests per 5 minutes per IP address
- Prevents overwhelming YouTube's servers
- Reduces chance of IP being flagged

## Best Practices for Users

### 1. Timing
- Don't spam requests - wait between attempts
- Peak hours (US evening) may have more restrictions
- Try during off-peak hours for better success rates

### 2. Video Selection
- Public videos work better than unlisted/private
- Recent videos may have stricter protection
- Popular videos are often more accessible

### 3. Alternative Approaches
- Try different video formats/qualities
- Use direct file URLs when possible
- Consider using other supported platforms (Vimeo, etc.)

## Platform-Specific Solutions

### Render.com Hosting Issues
**Problem:** Shared IP addresses more likely to be flagged

**Solutions:**
- Automatic retry with delays implemented
- User-friendly error messages
- Rate limiting to prevent abuse

### Free Tier Limitations
- Cold starts may trigger additional bot checks
- Consider upgrading to paid tier for dedicated resources
- Monitor usage to stay within limits

## Error Messages & User Guidance

The app now provides helpful error messages:

- **429 Errors:** "YouTube has temporarily blocked this request. Try again in a few minutes."
- **Bot Detection:** "This is common with shared hosting. Try a different video URL."
- **Timeout:** "Large files or slow connections may cause this. Try again later."
- **Geo-blocking:** "This video may be geo-blocked or require authentication."

## Monitoring & Debugging

### Server Logs
Check Render.com logs for:
- yt-dlp command output
- Error patterns
- Request frequency

### Success Indicators
- Successful JSON parsing
- Video metadata extraction
- Format list generation

## Future Improvements

### Potential Enhancements
1. **Cookie Support:** For authenticated requests (requires user cookies)
2. **Proxy Rotation:** Multiple IP addresses (paid feature)
3. **Fallback Extractors:** Alternative extraction methods
4. **Caching:** Reduce repeat requests for same videos

### User Features
1. **Queue System:** Handle multiple requests gracefully
2. **Progress Tracking:** Real-time download progress
3. **Format Preview:** Show available formats before download
4. **Retry Button:** Manual retry for failed requests

## Support & Updates

- yt-dlp is regularly updated to handle YouTube changes
- Monitor GitHub issues for new solutions
- Update deployment when new yt-dlp versions are available

## Legal Considerations

- Respect YouTube's Terms of Service
- Only download content you have rights to
- Consider fair use and copyright laws
- Use responsibly and ethically
