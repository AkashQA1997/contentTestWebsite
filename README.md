# Content Comparison Tool

Works in **two modes**:

- **Manual mode (GitHub Pages compatible)**: paste **Expected** and **Actual** text, diff runs fully in the browser.
- **Backend mode (optional)**: if you host the Node/Playwright API somewhere, the site can fetch the live page text via `POST /compare`.

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

- The GitHub Pages UI lives in `root/`.
- In **Manual mode**, the browser normalizes both inputs and highlights the changed section.
- In **Backend mode**, the UI calls the hosted API endpoint (`/compare`) and renders the returned HTML diff.

## GitHub Pages (publish from `/root`)

Set your GitHub Pages source to the `root/` folder.

- Manual mode works on Pages with no backend.
- Backend mode requires appending `?api=...` to your Pages URL, for example:
  - `https://USER.github.io/REPO/?api=https://YOUR_BACKEND`

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


