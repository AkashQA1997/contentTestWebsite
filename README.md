# Content Comparison Tool

-Works in **two modes**:

- **Manual mode (GitHub Pages compatible)**: paste **Expected** and **Actual** text, diff runs fully in the browser.
- **Backend mode (optional)**: if you host the Node/Playwright API somewhere, the site can fetch the live page text via `POST /compare`.

## Requirements

- Node.js (npm)
- OpenAI API key (optional, for AI-based semantic analysis double-check)

## Setup

```bash
npm install
```

### Optional: AI verification

The server focuses on character-level comparison. AI-based semantic verification is optional and not required for core functionality.

## Run

```bash
npm start
```

Server starts on **`http://localhost:3000`**.

## How it works

- The GitHub Pages UI lives in `root/`.
- In **Manual mode**, the browser normalizes both inputs and highlights the changed section.
- In **Backend mode**, the UI calls the hosted API endpoint (`/compare`) and renders the returned HTML diff.
 - In **Backend mode**, the UI calls the hosted API endpoint (`/compare`) and renders the returned HTML diff.

## Content Quality Index (CQI) & Additional Analyses

The backend now computes a Content Quality Index (CQI) for the pasted (expected) content and several supplementary checks. These do not affect the character-level comparison/diff — `expectedHtml` and `actualHtml` are unchanged.

CQI formula (final score 0–100):
- Vocabulary richness (unique words / total words) — weight 40%
- Readability — weight 30% (uses `readability-scores` package; Flesch–Kincaid grade is mapped to 0–1 where lower grade → higher score; fallback: average sentence length)
- Length score — weight 30% (100+ words → full score)

Combined score = round(clamp(vocab*0.4 + readability*0.3 + length*0.3, 0, 1) * 100)

CQI output:
- `cqi.score` (number): 0–100
- `cqi.summary` (string): Excellent / Good / Fair / Poor
- `cqi.details`: component values (totalWords, uniqueWords, vocabRatio, readabilityScore, lengthScore) and raw `readabilityDetails` from the library.

Additional analyses included in the `/compare` response:

- SEO keyword optimization (`seo`):
  - If you provide `keywords` in the request body they are used; otherwise the server extracts top 5 candidate keywords from the pasted content.
  - Returns per-keyword counts, density, a coverage fraction and a composite score that favors presence and reasonable density (~1–3%).

- Engagement metrics (`engagement`):
  - Simple signals: headings, lists, CTAs (calls-to-action), links, sentence count.
  - Returns a score (0–100) and counts used to compute it.

- Duplicate content (`duplication`):
  - Internal duplication: sentence-level duplicate ratio.
  - Overlap with actual page: sentence overlap ratio.
  - Returns a duplication score and details.

- Broken links (`brokenLinks`):
  - Finds URLs in pasted content and performs HEAD requests (with a timeout) to check reachability.
  - Returns per-URL status and an overall reachable score.
  - Note: this performs network calls and may affect response time if many URLs or slow hosts.

- Intent relevance (`intentRelevance`):
  - Computes a simple cosine similarity of token frequencies between pasted and actual content.
  - Returned as a 0–100 score and a short summary (High / Moderate / Low relevance).

Sample expanded response (abridged):

```json
{
  "expectedHtml": "...",
  "actualHtml": "...",
  "cqi": { "score": 72, "summary": "Good content quality", "details": { /* ... */ } },
  "seo": { "score": 64, "keywords": [ /* ... */ ], "coverage": 0.6 },
  "engagement": { "score": 55, "details": { "headings": 2, "lists": 1, "ctaCount": 1 } },
  "duplication": { "score": 85, "details": { "internalDupRatio": 0.01, "overlapRatio": 0.2 } },
  "brokenLinks": { "score": 100, "details": { "urls": [] } },
  "intentRelevance": { "score": 72, "summary": "High relevance" }
}
```

If you'd like different weights, additional checks (engagement by scroll-depth estimates, social share signals), or to include external SEO keyword lists / site-wide duplicate checks, tell me which priorities to emphasize and I will adjust the scoring and README accordingly.

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
  "actualHtml": "Actual side with <span class=\"added\">…</span>"
}
```

**Response Fields:**

- `expectedHtml` (string): HTML with removed sections highlighted
- `actualHtml` (string): HTML with added sections highlighted

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


