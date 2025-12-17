import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import { diffChars } from "diff";   // ⬅ switched to char diff
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// Local dev: serve the GitHub Pages site from /root (absolute path so "/" always works)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticRoot = path.join(__dirname, "root");
app.use(express.static(staticRoot));
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.get("/", (_req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

// ----------------------------
// UTIL: Normalize text (IMPORTANT)
// ----------------------------
function normalizeText(text) {
  return text
    .replace(/\u00A0/g, " ")   // non-breaking spaces
    .replace(/\s+/g, " ")     // collapse all whitespace
    .trim();
}

// ----------------------------
// UTIL: Playwright text fetch
// ----------------------------
async function fetchWebsiteText(url, locator, type) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded" });

  let text = "";

  if (type === "css") {
    text = await page.locator(locator).innerText();
  }

  if (type === "id") {
    text = await page.locator(`#${locator}`).innerText();
  }

  if (type === "xpath") {
    text = await page.locator(`xpath=${locator}`).innerText();
  }

  await browser.close();
  return text;
}

// ----------------------------
// UTIL: HTML Diff Generator
// ----------------------------
function buildHtmlDiff(expected, actual) {
  const diffs = diffChars(expected, actual);

  let expectedHtml = "";
  let actualHtml = "";

  diffs.forEach(part => {
    if (part.added) {
      actualHtml += `<span class="added">${part.value}</span>`;
    } else if (part.removed) {
      expectedHtml += `<span class="removed">${part.value}</span>`;
    } else {
      expectedHtml += part.value;
      actualHtml += part.value;
    }
  });

  return { expectedHtml, actualHtml };
}

// ----------------------------
// API: Compare
// ----------------------------
app.post("/compare", async (req, res) => {
  try {
    const { url, locator, type, pastedContent } = req.body;

    if (!url || !locator || !type || !pastedContent) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch site text
    const siteTextRaw = await fetchWebsiteText(url, locator, type);

    // Normalize BOTH sides
    const expectedNormalized = normalizeText(pastedContent);
    const actualNormalized = normalizeText(siteTextRaw);

    // Build HTML diff
    const { expectedHtml, actualHtml } =
      buildHtmlDiff(expectedNormalized, actualNormalized);

    res.json({ expectedHtml, actualHtml });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
