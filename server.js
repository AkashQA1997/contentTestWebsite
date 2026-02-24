import "dotenv/config"; // Load .env file
import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import { diffChars } from "diff";   // ⬅ switched to char diff
import path from "path";
import { fileURLToPath } from "url";
import readabilityScores from "readability-scores";
import natural from "natural";

const app = express();
const PORT = 3000;
// Configurable parameters (via env)
const SAMPLE_WORD_LIMIT = Number(process.env.SAMPLE_WORD_LIMIT) || 5000;
const LENGTH_SCALE = Number(process.env.LENGTH_SCALE) || 1000; // larger -> depth matters more
const BROKEN_LINK_MODE = process.env.BROKEN_LINK_MODE || "fast"; // "off" | "fast" | "sync"
const BROKEN_LINK_MAX_URLS = Number(process.env.BROKEN_LINK_MAX_URLS) || 5;
const BROKEN_LINK_TIMEOUT_MS = Number(process.env.BROKEN_LINK_TIMEOUT_MS) || (BROKEN_LINK_MODE === "fast" ? 1000 : 3000);

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
// UTIL: Content Quality Index (CQI) for pasted content
// ----------------------------
function calculateCQI(pastedContent) {
  if (!pastedContent || pastedContent.trim().length === 0) {
    return { score: 0, summary: "No pasted content" };
  }

  const textFull = pastedContent.replace(/\s+/g, " ").trim();
  const wordsFull = textFull.split(/\s+/).filter(Boolean);
  const totalWords = wordsFull.length;

  // For very large content, analyze a sample to keep CPU/memory bounded
  const SAMPLE_WORD_LIMIT = 5000;
  const useSampling = totalWords > SAMPLE_WORD_LIMIT;
  const words = useSampling ? wordsFull.slice(0, SAMPLE_WORD_LIMIT) : wordsFull;
  const textSample = words.join(" ");
  const sampleSize = words.length;

  // --- Vocabulary: Bayesian shrinkage to avoid inflated TTR on tiny texts
  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z0-9']/g, ""));
  const uniqueSample = new Set(lowerWords.filter(Boolean)).size;
  const prior = 0.5; // prior TTR for smoothing
  const k = 20; // pseudo-count (higher = stronger shrinkage)
  const vocabRatio = (uniqueSample + k * prior) / (Math.max(1, sampleSize) + k); // 0..1

  // --- Readability: robust mapping using readability-scores (logistic mapping)
  let readability = 0;
  let readabilityDetails = null;
  try {
    const rd = readabilityScores(textSample);
    readabilityDetails = rd || null;
    const fk = (rd && typeof rd.fleschKincaid === "number") ? rd.fleschKincaid : null;
    if (fk !== null) {
      // Logistic mapping: mu=12, sigma=4 (tuneable)
      const mu = 12;
      const sigma = 4;
      readability = 1 / (1 + Math.exp((fk - mu) / sigma));
    } else {
      // Fallback: average sentence length
      const sentences = textSample.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      const avgSentenceWords = sentences.length > 0 ? words.filter(Boolean).length / sentences.length : sampleSize;
      readability = 1 - Math.min(avgSentenceWords / 30, 1);
    }
  } catch (err) {
    const sentences = textSample.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const avgSentenceWords = sentences.length > 0 ? words.filter(Boolean).length / sentences.length : sampleSize;
    readability = 1 - Math.min(avgSentenceWords / 30, 1);
  }

  // --- Length: smooth saturating function (diminishing returns)
  const lengthScore = 1 - Math.exp(-totalWords / LENGTH_SCALE);

  // --- Confidence: downweight vocab/length when text is small
  const confidence = Math.min(1, totalWords / 100); // <100 words -> partial confidence
  const baseWeights = { vocab: 0.4, read: 0.3, length: 0.3 };
  const vocabWeight = baseWeights.vocab * confidence;
  const lengthWeight = baseWeights.length * confidence;
  const readWeight = 1 - (vocabWeight + lengthWeight); // readability absorbs remaining weight

  const combined = (vocabRatio * vocabWeight) + (readability * readWeight) + (lengthScore * lengthWeight);
  const score = Math.round(Math.max(0, Math.min(1, combined)) * 100);

  let summary = "";
  if (score >= 80) summary = "Excellent content quality";
  else if (score >= 60) summary = "Good content quality";
  else if (score >= 40) summary = "Fair content quality";
  else summary = "Poor content quality";

  const reliable = totalWords >= 30;

  return {
    score,
    summary,
    reliable,
    details: {
      totalWords,
      sampleSize,
      sampled: useSampling,
      uniqueSample,
      vocabRatio: Number(vocabRatio.toFixed(3)),
      readabilityScore: Number(readability.toFixed(3)),
      lengthScore: Number(lengthScore.toFixed(3)),
      weights: {
        vocabWeight: Number(vocabWeight.toFixed(3)),
        readWeight: Number(readWeight.toFixed(3)),
        lengthWeight: Number(lengthWeight.toFixed(3))
      },
      readabilityDetails
    }
  };
}

// ----------------------------
// UTIL: SEO Keyword Optimization (uses provided keywords or extracts top keywords)
// ----------------------------
function analyzeSEO(pastedContent, keywords = []) {
  const text = pastedContent.replace(/\s+/g, " ").trim().toLowerCase();
  const words = text.split(/\s+/).map(w => w.replace(/[^a-z0-9']/g, ""));
  const totalWords = words.filter(Boolean).length;

  // If no keywords provided, extract top 5 by frequency (excluding stopwords)
  const stopwords = natural.stopwords || [];
  const freq = {};
  words.forEach(w => {
    if (!w || stopwords.includes(w) || w.length < 3) return;
    freq[w] = (freq[w] || 0) + 1;
  });
  if (!keywords || keywords.length === 0) {
    keywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(e => e[0]);
  }

  const keywordStats = keywords.map(k => {
    const count = (words.filter(w => w === k.toLowerCase()) || []).length;
    const density = totalWords > 0 ? count / totalWords : 0;
    return { keyword: k, count, density: Number(density.toFixed(4)) };
  });

  // Score: coverage (how many keywords present) and average density proximity to 1-3%
  const present = keywordStats.filter(k => k.count > 0).length;
  const coverage = keywords.length > 0 ? present / keywords.length : 0;
  const idealDensity = 0.015; // 1.5%
  const densityScore = keywordStats.length > 0
    ? 1 - (keywordStats.reduce((acc, k) => acc + Math.abs(k.density - idealDensity), 0) / keywords.length) / idealDensity
    : 0;
  const densityClamped = Math.max(0, Math.min(1, densityScore));

  const score = Math.round(((coverage * 0.6) + (densityClamped * 0.4)) * 100);

  return { score, keywords: keywordStats, coverage: Number(coverage.toFixed(3)) };
}

// ----------------------------
// UTIL: Engagement metrics (CTAs, headings, lists, links)
// ----------------------------
function analyzeEngagement(pastedContent) {
  const text = pastedContent;
  const lines = text.split(/\r?\n/);
  const headings = lines.filter(l => /^\s*#{1,6}\s+/.test(l) || /^[A-Z][A-Za-z0-9\s]{10,}$/.test(l)).length;
  const lists = lines.filter(l => /^\s*([-*•]|\d+\.)\s+/.test(l)).length;
  const ctaKeywords = ["buy", "subscribe", "sign up", "learn more", "contact", "get started", "download"];
  const ctaCount = ctaKeywords.reduce((acc, k) => acc + (text.toLowerCase().split(k).length - 1), 0);
  const links = (text.match(/https?:\/\/[^\s)'"<>]+/g) || []).length;
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean).length;

  // Simple scoring: headings/lists/cta/links contribute positively, extremely long sentences detract
  const headingScore = Math.min(1, headings / 3);
  const listScore = Math.min(1, lists / 3);
  const ctaScore = Math.min(1, ctaCount / 2);
  const linkScore = Math.min(1, links / 5);
  const sentencePenalty = sentences > 0 ? Math.max(0, 1 - (sentences / 50)) : 1;

  const combined = (headingScore * 0.2) + (listScore * 0.15) + (ctaScore * 0.3) + (linkScore * 0.15) + (sentencePenalty * 0.2);
  const score = Math.round(Math.max(0, Math.min(1, combined)) * 100);

  return { score, details: { headings, lists, ctaCount, links, sentences } };
}

// ----------------------------
// UTIL: Duplicate content detection (internal repeats + vs actual)
// ----------------------------
function analyzeDuplicateContent(pastedContent, actualContent) {
  const sentences = pastedContent.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const total = sentences.length;
  const unique = new Set(sentences).size;
  const internalDupRatio = total > 0 ? (1 - (unique / total)) : 0; // 0 = no duplicates

  // Compare with actual content by sentence overlap ratio
  const actualSentences = actualContent.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const intersection = sentences.filter(s => actualSentences.includes(s)).length;
  const overlapRatio = Math.max(0, Math.min(1, intersection / Math.max(1, total)));

  // Score: lower duplication (internal) and reasonable overlap (not exact copy) are better.
  const score = Math.round(Math.max(0, Math.min(1, (1 - internalDupRatio) * 0.7 + (1 - overlapRatio) * 0.3)) * 100);

  return { score, details: { totalSentences: total, uniqueSentences: unique, internalDupRatio: Number(internalDupRatio.toFixed(3)), overlapRatio: Number(overlapRatio.toFixed(3)) } };
}

// ----------------------------
// UTIL: Broken links check (async)
// ----------------------------
async function checkBrokenLinks(pastedContent, timeoutMs = 3000) {
  // Behavior based on BROKEN_LINK_MODE:
  // - "off": skip checks and return perfect score
  // - "fast": check up to BROKEN_LINK_MAX_URLS with short timeout
  // - "sync": check all URLs with configured timeoutMs
  const urlsAll = Array.from(new Set((pastedContent.match(/https?:\/\/[^\s)'"<>]+/g) || [])));
  if (urlsAll.length === 0) return { score: 100, details: { urls: [] } };

  if (BROKEN_LINK_MODE === "off") {
    return { score: 100, details: { skipped: true, mode: "off", urlCount: urlsAll.length } };
  }

  const urls = BROKEN_LINK_MODE === "fast" ? urlsAll.slice(0, BROKEN_LINK_MAX_URLS) : urlsAll;
  const timeout = timeoutMs || BROKEN_LINK_TIMEOUT_MS;

  const checks = await Promise.allSettled(urls.map(url => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { method: "HEAD", signal: controller.signal })
      .then(resp => {
        clearTimeout(timer);
        return { url, ok: resp.ok, status: resp.status };
      })
      .catch(err => {
        clearTimeout(timer);
        return { url, ok: false, status: err.name === "AbortError" ? "timeout" : "error" };
      });
  }));

  const results = checks.map(c => c.status === "fulfilled" ? c.value : { url: null, ok: false, status: "error" });
  const broken = results.filter(r => !r.ok).length;
  const score = Math.round(Math.max(0, Math.min(1, 1 - (broken / results.length))) * 100);
  return { score, details: { mode: BROKEN_LINK_MODE, urlsChecked: results.length, urls: results } };
}

// ----------------------------
// UTIL: Intent relevance (cosine similarity between pasted and actual)
// ----------------------------
function computeCosineSimilarity(a, b) {
  const tokenize = txt => txt.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(w => w.length > 2);
  const toksA = tokenize(a);
  const toksB = tokenize(b);
  const freqA = {};
  const freqB = {};
  toksA.forEach(t => { freqA[t] = (freqA[t] || 0) + 1; });
  toksB.forEach(t => { freqB[t] = (freqB[t] || 0) + 1; });
  const all = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
  let dot = 0, normA = 0, normB = 0;
  all.forEach(k => {
    const va = freqA[k] || 0;
    const vb = freqB[k] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  });
  const sim = (normA > 0 && normB > 0) ? (dot / (Math.sqrt(normA) * Math.sqrt(normB))) : 0;
  return sim;
}

// (Meaning-drift analysis removed)

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

    // Combine results (include CQI + additional analyses for pasted content)
    const cqi = calculateCQI(expectedNormalized);
    const seo = analyzeSEO(expectedNormalized, req.body.keywords || []);
    const engagement = analyzeEngagement(expectedNormalized);
    const duplication = analyzeDuplicateContent(expectedNormalized, actualNormalized);
    const brokenLinks = await checkBrokenLinks(expectedNormalized);
    const intentRelevanceScore = Math.round(computeCosineSimilarity(expectedNormalized, actualNormalized) * 100);

    const response = {
      expectedHtml,
      actualHtml,
      cqi,
      seo,
      engagement,
      duplication,
      brokenLinks,
      intentRelevance: {
        score: intentRelevanceScore,
        summary: intentRelevanceScore >= 70 ? "High relevance" : intentRelevanceScore >= 40 ? "Moderate relevance" : "Low relevance"
      }
    };

    res.json(response);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// API: CQI only (pasted content)
// ----------------------------
app.post("/cqi", async (req, res) => {
  try {
    const { pastedContent } = req.body;
    if (!pastedContent) {
      return res.status(400).json({ error: "Missing pastedContent" });
    }

    const expectedNormalized = normalizeText(pastedContent);
    const cqi = calculateCQI(expectedNormalized);
    res.json({ cqi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
