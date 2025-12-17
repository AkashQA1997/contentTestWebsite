# Content Comparison Tool

Small web app that compares **expected (pasted) text** against **text extracted from a live webpage** (via Playwright), then shows a side-by-side diff highlighting additions/removals.

## Requirements

- Node.js (npm)

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

Server starts on **`http://localhost:3000`**.

## How it works

- The UI is served from `public/` (static files).
- Submitting the form calls `POST /compare`.
- The server uses Playwright (Chromium) to fetch text from the page using one of:
  - CSS selector
  - Element ID
  - XPath
- Both the pasted content and fetched content are normalized:
  - Non‑breaking spaces → spaces
  - Whitespace collapsed
  - Trimmed
- A character-level diff is produced and returned as HTML spans:
  - `.added` highlights content present in **Actual** only
  - `.removed` highlights content missing from **Actual** (present in Expected only)

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

## Project structure

```text
contentTestSite/
  server.js            # Express server + Playwright extraction + diff API
  package.json         # Dependencies + start script
  package-lock.json
  public/              # Static frontend served by Express
    index.html         # Form UI
    app.js             # Form submit -> POST /compare, renders diff + status
    style.css          # Styling for layout + diff highlights
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


