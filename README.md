# Content Comparison Tool

Works in **two modes**:

> 📖 **For detailed information about Meaning Drift Assessment, see [MEANING_DRIFT_ASSESSMENT.md](./MEANING_DRIFT_ASSESSMENT.md)**

- **Manual mode (GitHub Pages compatible)**: paste **Expected** and **Actual** text, diff runs fully in the browser.
- **Backend mode (optional)**: if you host the Node/Playwright API somewhere, the site can fetch the live page text via `POST /compare`.

## Requirements

- Node.js (npm)
- OpenAI API key (optional, for AI-based semantic analysis double-check)

## Setup

```bash
npm install
```

### Optional: AI Verification (FREE Options Available!)

For enhanced meaning drift analysis with AI double-checking, set one of these environment variables:

#### 🆓 **FREE Options (No Credit Card Required):**

1. **Hugging Face** (Recommended - Completely Free)
   ```bash
   HUGGINGFACE_API_KEY=your_huggingface_token_here
   ```
   Get free token: https://huggingface.co/settings/tokens
   - ✅ No credit card needed
   - ✅ Free forever
   - ✅ Unlimited requests (rate limited)

2. **Google Gemini** (Free Tier)
   ```bash
   GEMINI_API_KEY=your_gemini_key_here
   ```
   Get free key: https://makersuite.google.com/app/apikey
   - ✅ Free tier: 60 requests/minute
   - ✅ No credit card needed initially

3. **Groq** (Free Tier - Very Fast)
   ```bash
   GROQ_API_KEY=your_groq_key_here
   ```
   Get free key: https://console.groq.com/keys
   - ✅ Free tier available
   - ✅ Very fast responses

#### 💰 Paid Option:

4. **OpenAI** (Paid)
   ```bash
   OPENAI_API_KEY=your_openai_key_here
   ```
   Get key: https://platform.openai.com/api-keys

**How it works:**
- The tool tries providers in order: Hugging Face → Gemini → Groq → OpenAI
- Uses the first available API key found
- Works perfectly without any API key using rule-based analysis only
- AI verification provides a second opinion on semantic differences

**Note:** Set only ONE API key (the one you want to use). The tool will automatically use the first one it finds.

## Run

```bash
npm start
```

Server starts on **`http://localhost:3000`**.

## How it works

- The GitHub Pages UI lives in `root/`.
- In **Manual mode**, the browser normalizes both inputs and highlights the changed section.
- In **Backend mode**, the UI calls the hosted API endpoint (`/compare`) and renders the returned HTML diff.

### Meaning drift calculation (rule‑based – pasted content only)

The **Meaning Drift** score shown in the UI is currently **purely rule‑based** and is computed **only on the “Pasted (Expected)” text**, not by comparing it to the live page text.

- **Step 1 – Tokenization & cleaning**
  - Lower‑case the pasted text
  - Tokenize into words using `natural.WordTokenizer`
  - Remove:
    - very short tokens (length ≤ 2)
    - stop words from `natural.stopwords`
  - Stem remaining words with `natural.PorterStemmer`

- **Step 2 – Word diversity**
  - Let:
    - `totalWords` = number of stemmed tokens
    - `uniqueWords` = number of distinct stemmed tokens
  - Compute **word diversity**:
    - `wordDiversity = uniqueWords / totalWords`  (range \(0–1\); higher = richer vocabulary)

- **Step 3 – Length factor**
  - Compute a simple **length score**:
    - `lengthScore = min(1, totalWords / 50)`
      - At ~50+ meaningful words, lengthScore ≈ 1 (no penalty for being “too short”)
      - Very short texts get a lower lengthScore
  - Convert to **length drift**:
    - `lengthDrift = 1 - lengthScore`

- **Step 4 – Final drift score (0–100)**
  - First compute a **diversity drift** (how far from ideal diversity):
    - `driftFromIdeal = 1 - wordDiversity`
  - Combine diversity + length:
    - `combinedDrift = driftFromIdeal * 0.7 + lengthDrift * 0.3`
  - Convert to a **0–100 Meaning Drift score**:
    - `driftScore = round( clamp(combinedDrift, 0, 1) * 100 )`

Interpretation (as shown in the summary text):

- `0–19`  → *High semantic quality* – rich vocabulary, good structure
- `20–39` → *Good semantic quality*
- `40–59` → *Moderate semantic quality* – some repetition / limited vocabulary
- `60–79` → *Low semantic quality* – significant repetition or poor structure
- `80–100` → *Very low semantic quality* – highly repetitive or minimal meaningful content

The summary also includes the raw counts:  
`(<uniqueWords> unique words, <totalWords> total words)`.

## GitHub Pages (publish from `/root`)

GitHub Pages “Deploy from a branch” only supports publishing from `/(root)` or `/docs` (not an arbitrary `/root` folder).

This repo includes a GitHub Actions workflow that publishes the **`root/`** folder.

### Steps

- In GitHub: **Settings → Pages**
  - **Build and deployment**: select **GitHub Actions**
- Push to `main` (or run the workflow manually) and Pages will deploy `root/`.

- Manual mode works on Pages with no backend.
- Backend mode requires appending `?api=...` to your Pages URL, for example:
  - `https://USER.github.io/REPO/?api=https://YOUR_BACKEND`

## Free backend hosting (Render) — recommended: Docker

Render's "native" Node environment may fail installing Playwright OS dependencies (it tries to `su`/install packages).
This repo includes a `Dockerfile` that uses the official Playwright image (browsers + deps included).

### Steps

- Render → **New +** → **Web Service**
- Choose your GitHub repo + branch (e.g. `stage`)
- **Environment**: select **Docker**
- Deploy

After deploy, Render gives you a URL like `https://YOUR-SERVICE.onrender.com`.
Use it from Pages:

- `https://USER.github.io/REPO/?api=https://YOUR-SERVICE.onrender.com`

> ⚠️ **Troubleshooting**: If you get `ERR_CONNECTION_CLOSED` errors, see [RENDER_TROUBLESHOOTING.md](./RENDER_TROUBLESHOOTING.md) for solutions.

> 💡 **Alternative**: For always-free hosting (no sleeping), see [ORACLE_CLOUD_DEPLOYMENT.md](./ORACLE_CLOUD_DEPLOYMENT.md)

## API

### `POST /compare`

**Body (JSON):**

```json
{
  "url": "https://example.com/page",
  "locator": ".some-css-selector-or-id-or-xpath",
  "type": "css",
  "pastedContent": "Expected text here"
}
```

**Fields:**

- `url` (string): Page URL to load.
- `locator` (string): Selector value (depends on `type`).
- `type` (string): One of `css` | `id` | `xpath`.
- `pastedContent` (string): The expected content to compare against.

**Response (JSON):**

```json
{
  "expectedHtml": "Expected side with <span class=\"removed\">…</span>",
  "actualHtml": "Actual side with <span class=\"added\">…</span>",
  "meaningDrift": {
    "score": 25,
    "summary": "Minor meaning differences detected"
  },
  "aiVerification": {
    "score": 30,
    "summary": "Some semantic variations detected",
    "mismatch": false,
    "confidence": 85,
    "verified": true
  },
  "verificationNote": "ℹ️ Minor disagreement between analysis methods."
}
```

**Response Fields:**

- `expectedHtml` (string): HTML with removed sections highlighted
- `actualHtml` (string): HTML with added sections highlighted
- `meaningDrift` (object): Rule-based semantic analysis
  - `score` (number): Drift percentage (0-100)
  - `summary` (string): Human-readable summary
- `aiVerification` (object, optional): AI-based double-check (only if `OPENAI_API_KEY` is set)
  - `score` (number): AI-calculated drift percentage
  - `summary` (string): AI-generated summary
  - `mismatch` (boolean): AI's mismatch detection
  - `confidence` (number): AI confidence level (0-100)
  - `verified` (boolean): Whether AI analysis completed
- `verificationNote` (string, optional): Warning if rule-based and AI analyses disagree significantly

## Project structure

```text
contentTestSite/
  server.js            # Express server + Playwright extraction + diff API
  package.json         # Dependencies + start script
  package-lock.json
  root/                # GitHub Pages site (static)
    index.html         # UI (manual + optional backend mode)
    app.js             # In-browser compare + optional API call (?api=...)
    style.css          # Styling for layout + diff highlights
  public/              # (legacy) older static UI (not used by server now)
  uploads/             # Local upload artifacts (currently not used by the server)
  results.json         # Example output/log data (not required to run)
  node_modules/        # Installed dependencies
```

## Notes / troubleshooting

- If Playwright browsers aren’t installed, run:

```bash
npx playwright install
```

- If a locator matches multiple elements, Playwright may pick the first match. Tighten the selector if needed.


