# Content Quality Index (CQI) — Detailed Calculation & Examples

This file explains, in lay terms, exactly how CQI is computed and gives a worked example you can use in demos for clients or managers. It also contains short worked examples for the additional analyses (SEO, Engagement, Duplication, Broken links, Intent relevance).

## CQI — plain-language explanation

CQI is a single score between 0 and 100 that tells you how "good" pasted content looks based on three simple things:

1. Vocabulary richness (40% of the score) — Do you use many different words, or do you repeat the same words?
   - Computed as: uniqueWords ÷ totalWords (value between 0 and 1).
2. Readability (30% of the score) — How easy is the text to read?
   - We use the `readability-scores` library. It provides Flesch–Kincaid grade level (e.g., grade 8). We map grade → a 0–1 readability score where lower grade means easier reading:
     readability = clamp(1 − (fleschKincaid / 20), 0, 1).
   - If the library fails, we fall back to average sentence length (shorter sentences → higher score).
3. Length (30% of the score) — Longer, reasonably comprehensive content scores higher.
   - Computed as min(1, totalWords ÷ 100) — a text with 100+ words gets full length credit.

Final CQI:

1. Multiply each component by its weight:
   - vocabComponent = vocabRatio × 0.4
   - readabilityComponent = readability × 0.3
   - lengthComponent = lengthScore × 0.3
2. Sum the components, clamp to 0–1, then multiply by 100 and round:
   - combined = clamp(vocabComponent + readabilityComponent + lengthComponent, 0, 1)
   - CQI = round(combined × 100)

Buckets for talking to stakeholders:
- 80–100: Excellent
- 60–79: Good
- 40–59: Fair
- 0–39: Poor

## Worked example (step‑by‑step)

Example scenario (for your demo): a marketing paragraph with these measured values:
- totalWords = 120
- uniqueWords = 90
- readability library returns fleschKincaid = 8.0

Step 1 — Vocabulary richness:
- vocabRatio = uniqueWords ÷ totalWords = 90 ÷ 120 = 0.75

Step 2 — Readability:
- Map fleschKincaid to 0–1: readability = 1 − (8 ÷ 20) = 1 − 0.4 = 0.6
  (Interpretation: grade 8 is moderately easy → 0.6)

Step 3 — Length:
- lengthScore = min(1, totalWords ÷ 100) = min(1, 120 ÷ 100) = 1.0

Step 4 — Weighted components:
- vocabComponent = 0.75 × 0.4 = 0.30
- readabilityComponent = 0.6 × 0.3 = 0.18
- lengthComponent = 1.0 × 0.3 = 0.30

Step 5 — Combine:
- combined = 0.30 + 0.18 + 0.30 = 0.78
- CQI = round(0.78 × 100) = 78 → "Good content quality"

Talk track for demo:
- "This paragraph scored 78 because it uses varied vocabulary (0.75), is reasonably readable (Flesch–Kincaid ≈ 8), and is long enough to be informative (120 words)."

## Examples for the additional analyses (short, layman)

1) SEO keyword optimization (example)
- Given keywords: ["acme", "cars", "reliable"]
- Suppose the pasted text has counts: acme=3, cars=6, reliable=2 and totalWords=120.
- Densities: acme=3/120=0.025 (2.5%), cars=6/120=0.05 (5%), reliable=2/120≈0.0167 (1.67%).
- Coverage = keywords present ÷ total keywords = 3/3 = 1.0 (100% covered).
- The SEO score balances coverage and how close densities are to a target (~1.5%). In this example, coverage is perfect but one keyword is dense (cars=5%) — overall SEO score might be around 70–85 depending on density penalty.

2) Engagement (example)
- Signals counted: headings, lists, CTAs, links.
- Example: headings=2, lists=1, ctaCount=1, links=2, sentences=8.
- These are mapped to small scores (e.g., headings contribute up to 20% of engagement) and combined into a 0–100 engagement score. Fewer headings/lists or zero CTAs lowers engagement.

3) Duplicate content (example)
- Internal duplication: if 10 sentences and 2 are exact repeats → internalDupRatio = 1 − (unique / total) = 1 − (8/10) = 0.20 (20% duplicate).
- Overlap with actual page: if 3/10 sentences also appear unchanged on the live page → overlapRatio = 0.3.
- The duplication score rewards low internal duplication and low excessive overlap (exact copy). Lower duplication → higher score.

4) Broken links (example)
- If pasted text includes 3 URLs and one returns HTTP 404 or times out, reachable ratio = 2/3 → broken link score ≈ 66.
- Note: these checks make network calls and can slow the response. Use with care in demos.

5) Intent relevance (example)
- We compute a simple similarity between pasted content and the actual page using token frequency cosine similarity.
- Example: similarity = 0.78 → intentRelevance ≈ 78 (High relevance).
- Use this to show whether the pasted copy matches the live page's topic and intent.

## How to present this to non-technical stakeholders

- Show the CQI number and the three component bars (Vocabulary, Readability, Length) so they see the drivers at a glance.
- For SEO/Engagement/BrokenLinks show 1–2 actionable recommendations: e.g., "Add 1–2 headings", "Reduce keyword 'cars' density from 5% → ~1.5%", "Fix 1 broken link".
- For duplication/intent show a short sentence: "Content is 30% identical to live page — consider rewording" or "High intent match: content aligns with page topic".

If you want, I can:
- Generate a single-slide PDF with the worked example and visuals.
- Add a small UI panel to `root/index.html` to show CQI + component bars during your demo.

## Notes: handling very small and very large content

- Sampling for very large content: to keep CPU and memory usage bounded, the server analyzes a sample (first 5,000 words) when content exceeds that size. The API response exposes `cqi.details.sampled` (true) and `cqi.details.sampleSize` so you can show the user whether sampling occurred.
- Bayesian shrinkage for tiny texts: the implementation stabilizes vocabulary ratio for short snippets (uses k=20 pseudo-count with prior=0.5). This prevents tiny texts (e.g., 10 words) from showing artificially high vocabulary scores.
- Smooth length scoring: length uses a saturating exponential (1 − exp(−words / 300)) so 100 words is rewarded but 2,000 words give diminishing additional credit — this better reflects "depth" without letting very long documents dominate.
- Smooth length scoring: length uses a saturating exponential (1 − exp(−words / LENGTH_SCALE)) with a default LENGTH_SCALE of 1000 so 100 words is rewarded but very long documents give diminishing additional credit — this better reflects "depth" without letting very long documents dominate. You can tune LENGTH_SCALE via the environment variable `LENGTH_SCALE`.
- Sampling: default `SAMPLE_WORD_LIMIT` is 5000 (set via env var). For content longer than this the server analyzes a sample for performance; response includes `cqi.details.sampled` and `sampleSize`.
- Broken links: behavior is controlled by `BROKEN_LINK_MODE` env var:
  - `off` — skip link checks (fastest)
  - `fast` — check up to `BROKEN_LINK_MAX_URLS` (default 5) with a short timeout (default 1000ms)
  - `sync` — check all URLs with a longer timeout (default 3000ms)
  Set these via env vars: `BROKEN_LINK_MODE`, `BROKEN_LINK_MAX_URLS`, `BROKEN_LINK_TIMEOUT_MS`.
- Reliability flag: `cqi.reliable` is false for very short content (under ~30 words). In that case the UI should show the CQI but indicate lower confidence and emphasize readability-driven signals.


