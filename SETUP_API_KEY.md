# 🔐 Secure API Key Setup

## ⚠️ IMPORTANT: Never share your API keys publicly!

If you've exposed an API key:
1. **Immediately revoke it** on the provider's website
2. **Create a new key**
3. **Never commit keys to Git**

## Local Development Setup

### Windows (PowerShell):
```powershell
# Set environment variable for current session
$env:HUGGINGFACE_API_KEY="your_new_key_here"

# Or set permanently (User-level)
[System.Environment]::SetEnvironmentVariable("HUGGINGFACE_API_KEY", "your_new_key_here", "User")
```

### Windows (Command Prompt):
```cmd
setx HUGGINGFACE_API_KEY "your_new_key_here"
```

### Linux/Mac:
```bash
# For current session
export HUGGINGFACE_API_KEY="your_new_key_here"

# For permanent (add to ~/.bashrc or ~/.zshrc)
echo 'export HUGGINGFACE_API_KEY="your_new_key_here"' >> ~/.bashrc
source ~/.bashrc
```

### Using .env file (Recommended):
1. Create a `.env` file in the project root:
```bash
HUGGINGFACE_API_KEY=your_new_key_here
```

2. Install dotenv package (if not using Node.js built-in env):
```bash
npm install dotenv
```

3. Load in server.js (add at the top):
```javascript
import 'dotenv/config';
```

## Render/Docker Deployment

1. Go to your Render dashboard
2. Select your service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `HUGGINGFACE_API_KEY`
   - **Value**: `your_new_key_here`
6. Save and redeploy

## Verify It's Working

After setting the key, restart your server and check:
- Server logs should NOT show "AI analysis not available"
- When you run a comparison, you should see "🤖 AI verification [HUGGINGFACE]" in the UI

