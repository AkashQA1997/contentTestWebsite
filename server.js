import "dotenv/config"; // Load .env file
import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import { diffChars } from "diff";   // ⬅ switched to char diff
import path from "path";
import { fileURLToPath } from "url";
import readabilityScores from "readability-scores";
import natural from "natural";
import nspell from "nspell";

// Spelling engine cache for multiple languages
const spellCache = {}; // lang -> { spell, ready }

// Supported languages and their dictionary package names
const DICT_MAP = {
  en: "dictionary-en",
  es: "dictionary-es",
  fr: "dictionary-fr",
  de: "dictionary-de",
  pt: "dictionary-pt"
};

async function loadDictionaryFor(lang = "en") {
  if (spellCache[lang]) return spellCache[lang];
  const pkgName = DICT_MAP[lang] || DICT_MAP["en"];
  const entry = { spell: null, ready: false };
  spellCache[lang] = entry;
  try {
    // dynamic import
    const dictModule = await import(pkgName);
    const loader = dictModule && (dictModule.default || dictModule);
    let dict;
    if (typeof loader === "function") {
      // callback style
      dict = await new Promise((resolve, reject) => {
        try {
          loader((err, d) => {
            if (err) return reject(err);
            resolve(d);
          });
        } catch (e) {
          reject(e);
        }
      });
    } else if (loader && typeof loader.then === "function") {
      dict = await loader();
    } else if (loader && (loader.aff || loader.dic)) {
      dict = loader;
    } else {
      throw new Error("Unsupported dictionary export shape");
    }

    entry.spell = nspell(dict);
    entry.ready = true;
    console.log(`✅ Spelling dictionary loaded for ${lang}`);
  } catch (err) {
    entry.ready = false;
    console.error(`Spelling dictionary load error for ${lang}:`, err.message || err);
  }
  return entry;
}

const app = express();
const PORT = 3000;
// Configurable parameters (via env)
const SAMPLE_WORD_LIMIT = Number(process.env.SAMPLE_WORD_LIMIT) || 5000;
const LENGTH_SCALE = Number(process.env.LENGTH_SCALE) || 200; // words at which length score saturates (~63% at scale, ~86% at 2×scale)
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

  // --- Readability: sentence-length based (primary) + FK grade (reference only)
  //
  // WHY sentence length, not Flesch-Kincaid:
  //   IT/enterprise content uses technically precise vocabulary (cybersecurity, infrastructure,
  //   regulatory, etc.) that is inherently multi-syllabic. Flesch-Kincaid penalises these words
  //   regardless of how clearly they are written, routinely returning grade 16–20 for normal
  //   professional IT copy. That is not a readability problem — it is a vocabulary domain mismatch.
  //   Content writers in an IT organisation can and should control sentence length; they cannot
  //   simplify mandatory technical terms. Sentence length is therefore the correct readability
  //   signal here.
  //
  // Formula:
  //   readability = 1 / (1 + exp((avgSentLen - 18) / 5))
  //   mu  = 18  → 18-word sentences are the neutral point (0.50); shorter scores higher.
  //   sigma = 5 → gradual curve; each extra word doesn't cause a sharp drop.
  //
  // Benchmark:
  //   ≤ 10 words/sentence → 0.87  (crisp, scannable)
  //   14 words/sentence   → 0.69  (clear professional writing)
  //   18 words/sentence   → 0.50  (neutral — acceptable but room to improve)
  //   22 words/sentence   → 0.31  (too long — recommend splitting)
  //   26 words/sentence   → 0.18  (hard to follow)
  //
  let readability = 0;
  let readabilityDetails = null;
  try {
    const rd = readabilityScores(textSample);
    readabilityDetails = rd || null;             // store FK etc. for the "Show calculation" display
  } catch (_) { /* library error — details unavailable */ }

  const sentences = textSample.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const avgSentenceWords = sentences.length > 0
    ? words.filter(Boolean).length / sentences.length
    : sampleSize;
  readability = 1 / (1 + Math.exp((avgSentenceWords - 18) / 5));

  // --- Length: smooth saturating function (diminishing returns)
  const lengthScore = 1 - Math.exp(-totalWords / LENGTH_SCALE);

  // --- Section type detection — calibrated for IT / enterprise content
  // Targets reflect professional content quality standards for a technology organisation.
  let sectionType, targetCQI, sectionNote;
  if (totalWords < 50) {
    sectionType = "Hero / Tagline";
    targetCQI   = 55;
    sectionNote = "Short-form copy (< 50 words). Scored on vocabulary and readability only — length is not penalised.";
  } else if (totalWords < 100) {
    sectionType = "Service Card / Feature";
    targetCQI   = 55;
    sectionNote = "Short service or feature description (50–99 words). Focus on clear, specific language. Aim for CQI ≥ 55.";
  } else if (totalWords < 200) {
    sectionType = "Section Intro / About";
    targetCQI   = 60;
    sectionNote = "Short body section (100–199 words). Should introduce the topic clearly with diverse vocabulary. Aim for CQI ≥ 60.";
  } else if (totalWords < 500) {
    sectionType = "Page Section / Landing Copy";
    targetCQI   = 65;
    sectionNote = "Core page section (200–499 words). Full vocabulary, readability, and depth are evaluated. Aim for CQI ≥ 65.";
  } else if (totalWords < 1000) {
    sectionType = "Case Study / Blog Post";
    targetCQI   = 70;
    sectionNote = "Long-form content (500–999 words). High vocabulary diversity and readability expected. Aim for CQI ≥ 70.";
  } else {
    sectionType = "Technical Article / Whitepaper";
    targetCQI   = 72;
    sectionNote = "In-depth technical content (1000+ words). Should demonstrate depth, variety, and structured clarity. Aim for CQI ≥ 72.";
  }

  // --- Fully dynamic weights — no hardcoded thresholds
  // The length score (1 − exp(−words/SCALE)) already scales continuously:
  //   30 words  → lengthScore ≈ 0.14 → length contribution ≈ 0.042  (naturally small)
  //   150 words → lengthScore ≈ 0.53 → length contribution ≈ 0.159  (meaningful)
  //   300 words → lengthScore ≈ 0.78 → length contribution ≈ 0.234  (strong)
  // So there is no need for any special-case threshold: all weights stay constant
  // and the exponential saturation of lengthScore handles the "short text" case.
  const vocabWeight  = 0.4;
  const readWeight   = 0.3;
  const lengthWeight = 0.3;

  const combined = (vocabRatio * vocabWeight) + (readability * readWeight) + (lengthScore * lengthWeight);
  const score = Math.round(Math.max(0, Math.min(1, combined)) * 100);

  // Section-aware summary: compare score against the section's target CQI
  let summary = "";
  let status  = "";   // "meets" | "near" | "needs_improvement" | "poor"

  const gap = targetCQI - score; // positive = below target

  if (score >= targetCQI + 20) {
    status  = "exceeds";
    summary = `Excellent — well above the ${sectionType} target (CQI ≥ ${targetCQI})`;
  } else if (score >= targetCQI) {
    status  = "meets";
    summary = `Meets the ${sectionType} content quality target (CQI ≥ ${targetCQI})`;
  } else if (gap <= 10) {
    status  = "near";
    summary = `Almost there — ${gap} point${gap !== 1 ? "s" : ""} below the ${sectionType} target (CQI ≥ ${targetCQI}). Minor improvements needed.`;
  } else if (gap <= 25) {
    status  = "needs_improvement";
    summary = `Needs improvement — ${gap} points below the ${sectionType} target (CQI ≥ ${targetCQI}). See suggestions below.`;
  } else {
    status  = "poor";
    summary = `Significantly below the ${sectionType} target (CQI ≥ ${targetCQI}). Content needs substantial rework.`;
  }

  // reliable = false for very short texts where scores are less meaningful
  const reliable = totalWords >= 30;

  return {
    score,
    summary,
    status,
    reliable,
    sectionType,
    targetCQI,
    sectionNote,
    details: {
      totalWords,
      sampleSize,
      sampled: useSampling,
      uniqueSample,
      avgSentenceWords: Number(avgSentenceWords.toFixed(1)),
      sentenceCount: sentences.length,
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
// UTIL: Spelling analysis (uses nspell)
// ----------------------------
async function analyzeSpelling(pastedContent, lang = "en") {
  const entry = await loadDictionaryFor(lang);
  if (!entry || !entry.ready) {
    return { available: false, message: `Dictionary for ${lang} not loaded` };
  }
  const spell = entry.spell;

  const textFull = pastedContent.replace(/\s+/g, " ").trim();
  const wordsFull = textFull.split(/\s+/).filter(Boolean);
  const totalWords = wordsFull.length;
  const useSampling = totalWords > SAMPLE_WORD_LIMIT;
  const words = useSampling ? wordsFull.slice(0, SAMPLE_WORD_LIMIT) : wordsFull;

  const freq = {};
  words.forEach(w => {
    const cleaned = w.toLowerCase().replace(/[^a-z\u00C0-\u024F']/g, ""); // allow accented letters
    if (!cleaned || cleaned.length < 2) return;
    freq[cleaned] = (freq[cleaned] || 0) + 1;
  });

  const uniqueWords = Object.keys(freq).length;
  const misspelled = [];
  let missCount = 0;
  for (const [word, count] of Object.entries(freq)) {
    try {
      if (!spell.correct(word)) {
        misspelled.push({ word, count, suggestions: (spell.suggest(word) || []).slice(0, 3) });
        missCount += count;
      }
    } catch (e) {
      // skip problematic words
    }
  }

  misspelled.sort((a, b) => b.count - a.count);
  const top = misspelled.slice(0, 10);
  const score = Math.round(Math.max(0, Math.min(1, 1 - (missCount / Math.max(1, words.length)))) * 100);

  return {
    available: true,
    lang,
    sampled: useSampling,
    sampleSize: useSampling ? Math.min(SAMPLE_WORD_LIMIT, words.length) : words.length,
    totalWords,
    uniqueWords,
    misspelledCount: missCount,
    misspelledUnique: misspelled.length,
    topMisspellings: top,
    score
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

    const spelling = await analyzeSpelling(expectedNormalized, req.body.lang || "en");
    const response = {
      expectedHtml,
      actualHtml,
      cqi,
      spelling,
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
    const spelling = await analyzeSpelling(expectedNormalized, req.body.lang || "en");
    res.json({ cqi, spelling });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
