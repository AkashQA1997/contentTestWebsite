import "dotenv/config"; // Load .env file
import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import { diffChars } from "diff";   // ⬅ switched to char diff
import path from "path";
import { fileURLToPath } from "url";
import natural from "natural";

const app = express();
const PORT = 3000;

// CORS configuration - allow all origins for GitHub Pages
app.use(cors({
  origin: '*', // Allow all origins (GitHub Pages, localhost, etc.)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());
// Local dev: serve the GitHub Pages site from /root (absolute path so "/" always works)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticRoot = path.join(__dirname, "root");
// API routes (before static files to avoid conflicts)
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Test endpoint to check API keys
app.get("/test-api-keys", (_req, res) => {
  res.json({
    huggingface: !!process.env.HUGGINGFACE_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    huggingfaceKey: process.env.HUGGINGFACE_API_KEY ? process.env.HUGGINGFACE_API_KEY.substring(0, 20) + "..." : null,
    message: "Check server console for detailed startup logs"
  });
});

// Static files (after API routes)
app.use(express.static(staticRoot));
app.get("/", (_req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

// ----------------------------
// UTIL: Normalize text (IMPORTANT)
// ----------------------------
function normalizeText(text) {
  return text
    .replace(/\u00A0/g, " ")   // non-breaking spaces
    .replace(/\u2019/g, "'")   // normalize curly apostrophe (') to straight apostrophe (')
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
// UTIL: Meaning Drift Analysis for Pasted Content Only
// ----------------------------
function calculateMeaningDriftForPastedContent(pastedContent) {
  if (!pastedContent || pastedContent.trim().length === 0) {
    return { score: 0, summary: "No pasted content to analyze" };
  }

  // Tokenize and normalize words
  const tokenizer = new natural.WordTokenizer();
  const stopwords = natural.stopwords || [];
  
  const tokens = tokenizer.tokenize(pastedContent.toLowerCase())
    .filter(word => word && word.length > 2 && !stopwords.includes(word))
    .map(word => natural.PorterStemmer.stem(word));

  if (tokens.length === 0) {
    return { score: 0, summary: "Content contains only stop words" };
  }

  // Calculate word frequency and diversity
  const wordFreq = {};
  tokens.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });

  const uniqueWords = Object.keys(wordFreq).length;
  const totalWords = tokens.length;
  const wordDiversity = uniqueWords / totalWords; // Higher = more diverse vocabulary

  // Calculate semantic coherence metrics
  // Lower diversity might indicate repetition or lack of semantic richness
  // Higher diversity might indicate good semantic coverage
  
  // Calculate average word frequency (lower = more diverse, higher = more repetitive)
  const avgFreq = totalWords / uniqueWords;
  
  // Calculate drift score based on content quality metrics
  // Low diversity (repetitive) = higher drift (less meaningful variation)
  // High diversity (rich vocabulary) = lower drift (good semantic coverage)
  // We'll invert this: high diversity = low drift, low diversity = high drift
  const diversityScore = wordDiversity; // 0-1, higher is better
  const driftFromIdeal = 1 - diversityScore; // How far from ideal diversity
  
  // Also consider if content is too short (less meaningful)
  const lengthScore = Math.min(1, totalWords / 50); // Normalize to 0-1, 50 words = full score
  const lengthDrift = 1 - lengthScore; // Shorter content = higher drift
  
  // Combined drift score (weighted: 70% diversity, 30% length)
  const combinedDrift = (driftFromIdeal * 0.7) + (lengthDrift * 0.3);
  const driftScore = Math.max(0, Math.min(100, Math.round(combinedDrift * 100)));

  // Generate summary
  let summary = "";
  if (driftScore < 20) {
    summary = "High semantic quality - rich vocabulary and good content structure";
  } else if (driftScore < 40) {
    summary = "Good semantic quality - adequate vocabulary diversity";
  } else if (driftScore < 60) {
    summary = "Moderate semantic quality - some repetition or limited vocabulary";
  } else if (driftScore < 80) {
    summary = "Low semantic quality - significant repetition or poor structure";
  } else {
    summary = "Very low semantic quality - highly repetitive or minimal meaningful content";
  }

  // Add metrics to summary
  summary += ` (${uniqueWords} unique words, ${totalWords} total words)`;

  return {
    score: driftScore,
    summary: summary
  };
}

// ----------------------------
// UTIL: Meaning Drift Analysis (Legacy - comparing two texts)
// ----------------------------
function calculateMeaningDrift(expected, actual) {
  if (!expected || !actual) {
    return { score: 0, summary: "Insufficient text for analysis" };
  }

  // Tokenize and normalize words
  const tokenizer = new natural.WordTokenizer();
  // Common stop words - natural library provides this
  const stopwords = natural.stopwords || [];
  
  const expectedTokens = tokenizer.tokenize(expected.toLowerCase())
    .filter(word => word && word.length > 2 && !stopwords.includes(word))
    .map(word => natural.PorterStemmer.stem(word));
  
  const actualTokens = tokenizer.tokenize(actual.toLowerCase())
    .filter(word => word && word.length > 2 && !stopwords.includes(word))
    .map(word => natural.PorterStemmer.stem(word));

  if (expectedTokens.length === 0 && actualTokens.length === 0) {
    return { score: 0, summary: "Both texts contain only stop words" };
  }

  if (expectedTokens.length === 0 || actualTokens.length === 0) {
    return { score: 100, summary: "One text is empty or contains only stop words" };
  }

  // Calculate word frequency
  const expectedFreq = {};
  const actualFreq = {};
  
  expectedTokens.forEach(word => {
    expectedFreq[word] = (expectedFreq[word] || 0) + 1;
  });
  
  actualTokens.forEach(word => {
    actualFreq[word] = (actualFreq[word] || 0) + 1;
  });

  // Get unique words from both texts
  const allWords = new Set([...expectedTokens, ...actualTokens]);
  
  // Calculate Jaccard similarity (intersection over union)
  const intersection = expectedTokens.filter(word => actualTokens.includes(word));
  const union = new Set([...expectedTokens, ...actualTokens]);
  const jaccardSimilarity = intersection.length / union.size;
  
  // Calculate cosine similarity using TF-IDF-like approach
  let dotProduct = 0;
  let expectedNorm = 0;
  let actualNorm = 0;
  
  allWords.forEach(word => {
    const expectedCount = expectedFreq[word] || 0;
    const actualCount = actualFreq[word] || 0;
    dotProduct += expectedCount * actualCount;
    expectedNorm += expectedCount * expectedCount;
    actualNorm += actualCount * actualCount;
  });
  
  const cosineSimilarity = expectedNorm > 0 && actualNorm > 0
    ? dotProduct / (Math.sqrt(expectedNorm) * Math.sqrt(actualNorm))
    : 0;

  // Combined similarity score (weighted average)
  // Clamp similarity values to 0-1 range to prevent negative drift scores
  const jaccardClamped = Math.max(0, Math.min(1, jaccardSimilarity));
  const cosineClamped = Math.max(0, Math.min(1, cosineSimilarity));
  const combinedSimilarity = (jaccardClamped * 0.4) + (cosineClamped * 0.6);
  
  // Drift score is the inverse of similarity (0-100%)
  // Clamp to ensure it's always between 0 and 100
  const driftScore = Math.max(0, Math.min(100, Math.round((1 - combinedSimilarity) * 100)));
  
  // Generate summary
  const removedWords = expectedTokens.filter(word => !actualTokens.includes(word));
  const addedWords = actualTokens.filter(word => !expectedTokens.includes(word));
  
  let summary = "";
  if (driftScore < 10) {
    summary = "Meaning is highly similar";
  } else if (driftScore < 30) {
    summary = "Minor meaning differences detected";
  } else if (driftScore < 60) {
    summary = "Moderate meaning drift detected";
  } else {
    summary = "Significant meaning drift detected";
  }
  
  if (removedWords.length > 0 || addedWords.length > 0) {
    const keyChanges = [];
    if (removedWords.length > 0) {
      const topRemoved = [...new Set(removedWords)].slice(0, 3).join(", ");
      keyChanges.push(`Removed concepts: ${topRemoved}`);
    }
    if (addedWords.length > 0) {
      const topAdded = [...new Set(addedWords)].slice(0, 3).join(", ");
      keyChanges.push(`Added concepts: ${topAdded}`);
    }
    if (keyChanges.length > 0) {
      summary += `. ${keyChanges.join(". ")}`;
    }
  }

  return {
    score: driftScore,
    summary: summary
  };
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

    // Calculate meaning drift (analyzing only pasted/expected content)
    console.log("\n🔍 ===== Starting Meaning Drift Analysis (Pasted Content Only) =====");
    console.log("Pasted (Expected) text length:", expectedNormalized.length);
    
    let meaningDrift = { score: 0, summary: "Analysis unavailable" };
    try {
      meaningDrift = calculateMeaningDriftForPastedContent(expectedNormalized);
      console.log("✅ Meaning drift analysis complete");
      console.log("   Score:", meaningDrift.score);
      console.log("   Summary:", meaningDrift.summary);
    } catch (err) {
      console.error("❌ Meaning drift calculation error:", err);
      // Continue without meaning drift if calculation fails
    }
    console.log("===========================================\n");

    // Combine results
    const response = {
      expectedHtml,
      actualHtml,
      meaningDrift
    };

    res.json(response);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
