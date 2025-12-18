# Render.com Backend - Troubleshooting Guide

## Common Error: `ERR_CONNECTION_CLOSED`

This error occurs when GitHub Pages (frontend) cannot connect to Render (backend). Here's how to fix it:

## Quick Fixes

### 1. Check Your GitHub Pages URL Format

Your GitHub Pages URL should include the Render backend:

```
https://yourusername.github.io/contentTestSite/?api=https://your-service.onrender.com
```

**Important**: 
- Use `https://` (not `http://`)
- Don't include trailing slash: `https://service.onrender.com` ✅ (not `https://service.onrender.com/` ❌)
- The `?api=` parameter must be in the URL

### 2. Render Service is Sleeping (Most Common Issue)

**Problem**: Render's free tier services sleep after 15 minutes of inactivity.

**Solution**:
- First request after sleep takes **~30 seconds** to wake up
- Wait 30-60 seconds and try again
- The service will stay awake for 15 minutes after first request

**To prevent sleeping**:
- Upgrade to paid plan ($7/month) for always-on service
- Or use a service like UptimeRobot to ping your service every 5 minutes

### 3. Verify Render Service is Running

1. Go to your Render dashboard: https://dashboard.render.com
2. Check your service status - should show "Live" (green)
3. Click on your service
4. Check the "Logs" tab for any errors
5. Test the health endpoint: `https://your-service.onrender.com/health`

### 4. Check CORS Configuration

The backend should have CORS enabled (already configured in `server.js`):

```javascript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
```

### 5. Verify Environment Variables in Render

1. Go to Render dashboard → Your service → Environment
2. Make sure all required environment variables are set:
   - `HUGGINGFACE_API_KEY` (optional)
   - `OPENAI_API_KEY` (optional)
   - `GEMINI_API_KEY` (optional)
   - `GROQ_API_KEY` (optional)

### 6. Check Render Service Logs

1. In Render dashboard → Your service → Logs
2. Look for errors like:
   - Port binding issues
   - Missing dependencies
   - Environment variable errors
   - Playwright installation issues

### 7. Test Backend Directly

Open these URLs in your browser to test:

1. **Health check**: `https://your-service.onrender.com/health`
   - Should return: `{"ok":true}`

2. **API keys check**: `https://your-service.onrender.com/test-api-keys`
   - Should return JSON with API key status

If these don't work, the backend has an issue.

## Step-by-Step Debugging

### Step 1: Verify Backend URL
```bash
# In browser, test:
https://your-service.onrender.com/health
```

**Expected**: `{"ok":true}`

**If it fails**: Backend is not running or has errors

### Step 2: Check GitHub Pages URL
Make sure your GitHub Pages URL includes the `?api=` parameter:

```
✅ Correct: https://username.github.io/repo/?api=https://service.onrender.com
❌ Wrong:   https://username.github.io/repo/
❌ Wrong:   https://username.github.io/repo?api=https://service.onrender.com/  (trailing slash)
```

### Step 3: Check Browser Console
1. Open GitHub Pages site
2. Press `F12` to open Developer Tools
3. Go to **Console** tab
4. Look for errors when you submit the form
5. Go to **Network** tab
6. Submit the form and check the `/compare` request:
   - Status code (should be 200)
   - Response (should be JSON)
   - Error messages

### Step 4: Test with curl (Advanced)

```bash
# Test backend health
curl https://your-service.onrender.com/health

# Test compare endpoint
curl -X POST https://your-service.onrender.com/compare \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "locator": "body",
    "type": "css",
    "pastedContent": "test content"
  }'
```

## Common Issues and Solutions

### Issue: "Service is sleeping"
**Solution**: Wait 30 seconds for first request, or upgrade to paid plan

### Issue: "CORS error"
**Solution**: Already fixed in code - make sure you're using the latest version

### Issue: "404 Not Found"
**Solution**: Check the URL - make sure it's `https://service.onrender.com` (not `.com/`)

### Issue: "500 Internal Server Error"
**Solution**: Check Render logs for specific error messages

### Issue: "Timeout"
**Solution**: Render free tier has timeout limits. First request after sleep takes longer.

## Alternative: Use Oracle Cloud (Always Free)

If Render continues to have issues, consider switching to Oracle Cloud Always Free:
- No sleeping
- Always available
- See `ORACLE_CLOUD_DEPLOYMENT.md` for setup

## Still Having Issues?

1. Check Render service logs
2. Verify the backend URL is correct
3. Test the `/health` endpoint directly
4. Check browser console for specific error messages
5. Make sure you're using `https://` (not `http://`)

## Quick Checklist

- [ ] Render service shows "Live" status
- [ ] GitHub Pages URL includes `?api=https://your-service.onrender.com`
- [ ] Backend `/health` endpoint works
- [ ] No trailing slash in Render URL
- [ ] Using `https://` (not `http://`)
- [ ] Waited 30 seconds if service was sleeping
- [ ] Checked browser console for errors
- [ ] Verified CORS is enabled in backend

