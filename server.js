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

// Debug: Check if API keys are loaded on startup
console.log("🔍 Environment check on startup:");
console.log("  HUGGINGFACE_API_KEY:", process.env.HUGGINGFACE_API_KEY ? "✅ Found" : "❌ Not found");
console.log("  GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅ Found" : "❌ Not found");
console.log("  GROQ_API_KEY:", process.env.GROQ_API_KEY ? "✅ Found" : "❌ Not found");
console.log("  OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ Found" : "❌ Not found");

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
// UTIL: AI-Based Semantic Analysis (Double Check)
// Supports multiple free providers: Hugging Face, Gemini, Groq
// ----------------------------
async function aiSemanticAnalysis(expected, actual) {
  // Try providers in order: Hugging Face (free) -> Gemini (free) -> Groq (free) -> OpenAI (paid)
  const providers = [
    { name: "huggingface", key: process.env.HUGGINGFACE_API_KEY },
    { name: "gemini", key: process.env.GEMINI_API_KEY },
    { name: "groq", key: process.env.GROQ_API_KEY },
    { name: "openai", key: process.env.OPENAI_API_KEY }
  ];

  // Find all available providers
  const availableProviders = providers.filter(p => p.key);
  
  console.log("🔍 AI Analysis - Provider check:", {
    huggingface: !!process.env.HUGGINGFACE_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    available: availableProviders.map(p => p.name)
  });
  
  if (availableProviders.length === 0) {
    console.log("❌ No API key available for AI verification");
    return null; // No API key available
  }
  
  // Try each provider until one succeeds
  for (const provider of availableProviders) {
    console.log(`🔄 Trying ${provider.name}...`);
    
    try {
      const result = await tryProvider(provider, expected, actual);
      if (result) {
        console.log(`✅ Successfully used ${provider.name} for AI verification`);
        return result;
      } else {
        console.log(`⚠️ ${provider.name} returned null, trying next provider...`);
      }
    } catch (err) {
      console.error(`❌ ${provider.name} failed:`, err.message);
      console.log(`   Trying next provider...`);
    }
  }
  
  console.log("❌ All providers failed");
  return null;
}

async function tryProvider(provider, expected, actual) {
  const prompt = `You are a content quality assurance expert. Compare these two texts and analyze if their MEANING is the same or different.

Expected text: "${expected.substring(0, 1000)}"
Actual text: "${actual.substring(0, 1000)}"

Respond with a JSON object containing:
1. "score": a number 0-100 representing meaning drift percentage (0 = identical meaning, 100 = completely different meaning)
2. "summary": a brief explanation of the semantic differences
3. "mismatch": boolean indicating if there's a significant content mismatch
4. "confidence": a number 0-100 indicating confidence in the analysis

Only respond with valid JSON, no other text.`;

  let response;
  let content;

  try {
    switch (provider.name) {
      case "huggingface":
        // Hugging Face Inference API (FREE - no credit card needed)
        // Get free API key from: https://huggingface.co/settings/tokens
        // Using sentence-transformers embeddings and calculating cosine similarity
        const expectedText = expected.substring(0, 500);
        const actualText = actual.substring(0, 500);
        
        // Get embeddings for both texts
        // Using router endpoint - if this fails, consider using Gemini or Groq instead
        const embeddingsResponse = await fetch(
          "https://router.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${provider.key}`
            },
            body: JSON.stringify({
              inputs: [expectedText, actualText],
              options: {
                wait_for_model: true
              }
            })
          }
        );
        
        if (!embeddingsResponse.ok) {
          const errorText = await embeddingsResponse.text();
          console.error("❌ Hugging Face embeddings API error:", embeddingsResponse.status, embeddingsResponse.statusText);
          console.error("   Error details:", errorText);
          
          // Handle model loading (503 error) - retry after waiting
          if (embeddingsResponse.status === 503) {
            console.log("⏳ Hugging Face model is loading, waiting 15 seconds...");
            await new Promise(resolve => setTimeout(resolve, 15000));
            
            // Retry once
            const retryResponse = await fetch(
              "https://router.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${provider.key}`
                },
                body: JSON.stringify({
                  inputs: [expectedText, actualText]
                })
              }
            );
            
            if (!retryResponse.ok) {
              const retryError = await retryResponse.text();
              console.error("❌ Hugging Face retry error:", retryResponse.status, retryError);
              return null;
            }
            
            embeddings = await retryResponse.json();
          } else {
            return null;
          }
        } else {
          embeddings = await embeddingsResponse.json();
        }
        
        let embeddings;
        
        // Calculate cosine similarity between the two embeddings
        if (!Array.isArray(embeddings) || embeddings.length !== 2) {
          console.error("❌ Unexpected embeddings format:", typeof embeddings);
          return null;
        }
        
        const vec1 = embeddings[0];
        const vec2 = embeddings[1];
        
        if (!Array.isArray(vec1) || !Array.isArray(vec2) || vec1.length !== vec2.length) {
          console.error("❌ Invalid embedding vectors");
          return null;
        }
        
        // Calculate cosine similarity
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
          dotProduct += vec1[i] * vec2[i];
          norm1 += vec1[i] * vec1[i];
          norm2 += vec2[i] * vec2[i];
        }
        
        const similarityScore = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
        
        console.log("✅ Calculated cosine similarity:", similarityScore);
        
        // Validate similarity score
        console.log("   Extracted similarity score:", similarityScore);
        
        if (similarityScore === 0 || isNaN(similarityScore)) {
          console.error("❌ Could not extract similarity score from Hugging Face response");
          console.error("   Response structure:", Object.keys(similarityData || {}));
          return null;
        }
        
        // Convert similarity (0-1) to drift score (0-100)
        const driftScore = Math.round((1 - similarityScore) * 100);
        console.log(`✅ Calculated drift score: ${driftScore}% (from similarity: ${similarityScore})`);
        
        // Generate summary based on similarity
        let summary = "";
        if (similarityScore > 0.85) {
          summary = "High semantic similarity - meanings are very close";
        } else if (similarityScore > 0.65) {
          summary = "Moderate semantic similarity - some meaning differences";
        } else if (similarityScore > 0.4) {
          summary = "Low semantic similarity - significant meaning differences";
        } else {
          summary = "Very low semantic similarity - meanings are quite different";
        }
        
        return {
          score: driftScore,
          summary: summary,
          mismatch: similarityScore < 0.7,
          confidence: 80, // Semantic similarity models are quite reliable
          verified: true,
          provider: "huggingface"
        };

      case "gemini":
        // Google Gemini API (FREE tier: 60 requests/minute)
        // Get free API key from: https://makersuite.google.com/app/apikey
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${provider.key}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are a precise content comparison tool. Always respond with valid JSON only.\n\n${prompt}`
                }]
              }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 300
              }
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Gemini API error:", response.status, errorText);
          return null;
        }

        const geminiData = await response.json();
        content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        break;

      case "groq":
        // Groq API (FREE tier: very fast)
        // Get free API key from: https://console.groq.com/keys
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.key}`
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant", // Free fast model
            messages: [
              {
                role: "system",
                content: "You are a precise content comparison tool. Always respond with valid JSON only."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 300
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Groq API error:", response.status, errorText);
          return null;
        }

        const groqData = await response.json();
        content = groqData.choices[0]?.message?.content;
        break;

      case "openai":
        // OpenAI API (Paid, but included for completeness)
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.key}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a precise content comparison tool. Always respond with valid JSON only."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 300
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("OpenAI API error:", response.status, errorText);
          return null;
        }

        const openaiData = await response.json();
        content = openaiData.choices[0]?.message?.content;
        break;
    }

    if (!content) {
      return null;
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      return {
        score: Math.min(100, Math.max(0, analysis.score || 0)),
        summary: analysis.summary || "AI analysis completed",
        mismatch: analysis.mismatch || false,
        confidence: Math.min(100, Math.max(0, analysis.confidence || 0)),
        verified: true,
        provider: provider.name
      };
    }

    return null;
  } catch (err) {
    console.error(`AI semantic analysis error (${provider.name}):`, err.message);
    return null; // Fail gracefully
  }
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

    // Calculate meaning drift for pasted content only (rule-based, with error handling)
    let meaningDrift = { score: 0, summary: "Analysis unavailable" };
    try {
      meaningDrift = calculateMeaningDriftForPastedContent(expectedNormalized);
    } catch (err) {
      console.error("Meaning drift calculation error:", err);
      // Continue without meaning drift if calculation fails
    }

    // AI-based double-check (optional, only if API key is configured)
    console.log("\n🔍 ===== Starting AI Verification Check =====");
    console.log("Expected text length:", expectedNormalized.length);
    console.log("Actual text length:", actualNormalized.length);
    
    let aiVerification = null;
    try {
      // Debug: Check if API key is loaded
      console.log("Checking for API keys...");
      console.log("  HUGGINGFACE_API_KEY:", process.env.HUGGINGFACE_API_KEY ? `✅ Found (${process.env.HUGGINGFACE_API_KEY.substring(0, 15)}...)` : "❌ Not found");
      console.log("  GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅ Found" : "❌ Not found");
      console.log("  GROQ_API_KEY:", process.env.GROQ_API_KEY ? "✅ Found" : "❌ Not found");
      
      if (!process.env.HUGGINGFACE_API_KEY && !process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
        console.log("⚠️ No API keys found - skipping AI verification");
      } else {
        console.log("✅ API key found, calling aiSemanticAnalysis()...");
        aiVerification = await aiSemanticAnalysis(expectedNormalized, actualNormalized);
        
        if (aiVerification) {
          console.log("✅ AI verification successful!");
          console.log("   Provider:", aiVerification.provider);
          console.log("   Score:", aiVerification.score);
          console.log("   Summary:", aiVerification.summary);
        } else {
          console.log("⚠️ AI verification returned null");
          console.log("   This could mean:");
          console.log("   - API call failed");
          console.log("   - Response format unexpected");
          console.log("   - Model is loading (503 error)");
        }
      }
    } catch (err) {
      console.error("❌ AI verification error:", err.message);
      console.error("   Stack:", err.stack);
      // Continue without AI verification if it fails
    }
    console.log("===========================================\n");

    // Combine results
    const response = {
      expectedHtml,
      actualHtml,
      meaningDrift
    };

    // Add AI verification if available
    if (aiVerification) {
      response.aiVerification = aiVerification;
      
      // If AI and rule-based disagree significantly, flag it
      const scoreDiff = Math.abs(meaningDrift.score - aiVerification.score);
      if (scoreDiff > 30) {
        response.verificationNote = "⚠️ Rule-based and AI analysis show significant disagreement. Review manually.";
      } else if (scoreDiff > 15) {
        response.verificationNote = "ℹ️ Minor disagreement between analysis methods.";
      }
    }

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
