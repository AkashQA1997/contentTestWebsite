# Content Quality Index (CQI) — Detailed Calculation & Examples

This file explains, in lay terms, exactly how CQI is computed and gives worked examples you can use in demos for clients or managers. It also documents section-aware scoring, industry-standard word-count targets, and short worked examples for the additional analyses (SEO, Engagement, Duplication, Broken links, Intent relevance).

---

## 1. What is CQI?

CQI (Content Quality Index) is a single score between **0 and 100** that tells you how good pasted content is, based on three measurable signals:

| # | Signal | Weight | What it measures |
|---|--------|--------|-----------------|
| 1 | **Vocabulary richness** | 40% | How many different words you use vs how many you repeat |
| 2 | **Readability** | 30% | How easy the text is to read (sentence length + word complexity) |
| 3 | **Length / depth** | 30% | Whether the content is long enough to be informative |

**Score bands:**

| Score | Label |
|-------|-------|
| 80–100 | Excellent content quality |
| 60–79  | Good content quality |
| 40–59  | Fair content quality |
| 0–39   | Poor content quality |

---

## 2. Section-Aware Scoring (Industry Standard)

Not all content is the same length. A homepage hero copy naturally has fewer words than a blog post. Our tool automatically detects which type of section you are checking and adjusts scoring and targets accordingly.

### Section types and targets

| Words | Section type | Length weight | Target CQI | What this means |
|-------|-------------|---------------|------------|-----------------|
| < 50 | **Hero / CTA** | **0 (excluded)** | ≥ 55 | Length is not penalised — only readability and vocabulary are scored |
| 50–149 | **Card / Feature block** | Normal | ≥ 50 | Short sections like service cards, feature descriptions |
| 150–499 | **Full section / Landing page** | Normal | ≥ 60 | About sections, value propositions, service pages |
| 500+ | **Blog / Article** | Normal | ≥ 70 | Long-form articles, guides, whitepapers |

### Why Hero / CTA sections are treated differently

Short-form copy (< 50 words) is intentionally concise — ads, taglines, CTAs. Penalising them for length would be unfair. For these sections the **length score weight is set to 0** and the remaining weight is redistributed entirely to readability and vocabulary. This means a crisp, varied 30-word tagline can still score well.

### Industry-standard minimum word counts

| Content type | Min words | Ideal words | CQI target |
|---|---|---|---|
| Social media / ad copy | 50–150 | — | Readability only |
| Product description | 150–300 | 250–400 | ≥ 60 |
| Landing page / homepage section | 150–300 | 300–500 | ≥ 60 |
| Full blog post | 600–800 | 1,000–1,500 | ≥ 70 |
| Long-form article / pillar page | 1,500+ | 2,000–3,000 | ≥ 75 |

> **Minimum for a reliable CQI reading:** 150 words.  
> **Sweet spot for most web content:** 300–500 words.  
> Under 100 words will always score low on length regardless of writing quality — that is not a flaw in the content, it simply reflects that short-form copy is measured differently.

---

## 3. How Each Metric is Calculated

### 3.1 Vocabulary ratio (0–1)

Measures how many unique (distinct) words appear in the text compared to total words. Uses Bayesian shrinkage to prevent tiny texts from getting inflated scores.

```
vocabRatio = (uniqueWords + k × prior) ÷ (totalWords + k)

where:  prior = 0.5 (expected ratio for average text)
        k     = 20  (smoothing strength — higher = stronger smoothing)
```

Example (100 words, 72 unique):
```
vocabRatio = (72 + 20 × 0.5) ÷ (100 + 20)
           = (72 + 10) ÷ 120
           = 82 ÷ 120
           = 0.683
```
Interpretation: a value close to 1.0 means almost every word is different (rich vocabulary); closer to 0.5 means heavy repetition.

---

### 3.2 Readability score (0–1)

Uses the Flesch–Kincaid grade level from the `readability-scores` library, then maps it to a 0–1 score using a logistic (S-curve) function.

```
readability = 1 ÷ (1 + exp((fleschKincaid − 14) ÷ 5))

mu    = 14  → grade 14 is the neutral point (readability = 0.50)
sigma = 5   → gradual curve so professional content is not unfairly penalised
```

| FK grade | Meaning | Readability score |
|----------|---------|-------------------|
| 6 | Very easy (children's book) | ≈ 0.88 |
| 8 | Easy (newspaper / blog) | ≈ 0.82 |
| 10 | Standard professional | ≈ 0.73 |
| 12 | Upper professional (marketing, reports) | ≈ 0.62 |
| 14 | Dense professional (college-level) | ≈ 0.50 |
| 16 | Academic / technical | ≈ 0.38 |

> **Why mu=14?** Standard professional web content targets FK grade 8–12. With mu=12 (old), grade 12 only scored 0.50 — penalising normal professional writing unfairly. With mu=14, grade 12 now scores 0.62, which correctly reflects that it is good, readable professional content.

**Fallback** (if library fails): average sentence length is used instead:
```
readability = 1 − min(avgSentenceWords ÷ 30, 1)
```
Shorter sentences → higher readability score.

---

### 3.3 Length score (0–1)

Uses a smooth, saturating function so that adding more words always helps but with diminishing returns (a 2,000-word article is not treated as infinitely better than a 500-word one).

```
lengthScore = 1 − exp(−totalWords ÷ LENGTH_SCALE)

Default LENGTH_SCALE = 200
```

| Words | Length score (scale=200) | Interpretation |
|-------|--------------------------|----------------|
| 50 | 0.22 | Very short |
| 100 | 0.39 | Short |
| 200 | 0.63 | Adequate |
| 300 | 0.78 | Good |
| 500 | 0.92 | Strong |
| 1000 | 0.99 | Full credit |

> For **Hero / CTA sections** (< 50 words) this score is ignored entirely (weight = 0).

---

### 3.4 Weights — fully dynamic, no thresholds

All weights are constant at **0.4 / 0.3 / 0.3** for every content length. No special cases or thresholds are applied. The dynamic behaviour comes entirely from the **length score** itself:

```
vocabWeight  = 0.40  (always)
readWeight   = 0.30  (always)
lengthWeight = 0.30  (always)
```

Because `lengthScore = 1 − exp(−words / LENGTH_SCALE)` grows continuously, its *contribution* to CQI scales naturally with word count:

| Words | lengthScore | Length contribution (× 0.30) |
|-------|-------------|------------------------------|
| 30    | 0.14        | 0.042  — barely anything     |
| 100   | 0.39        | 0.117  — minor factor        |
| 200   | 0.63        | 0.190  — meaningful          |
| 300   | 0.78        | 0.234  — strong              |
| 500+  | 0.92+       | 0.276+ — near full credit    |

This means a 30-word Hero tagline is not punished for being short — the length contribution is already tiny (~4 points max). There is no need to hardcode a threshold or redistribute weights.

---

### 3.5 Final CQI formula

```
combined = (vocabRatio × vocabWeight)
         + (readability × readWeight)
         + (lengthScore × lengthWeight)

CQI = round( clamp(combined, 0, 1) × 100 )
```

---

## 4. Worked Examples

### Example A — Full section / landing page (300 words)

| Metric | Value | Notes |
|--------|-------|-------|
| totalWords | 300 | → lengthScore = 1 − exp(−300/200) = 0.78 |
| uniqueWords | 210 | → vocabRatio = (210+10)/(300+20) = 0.69 |
| fleschKincaid | 10 | → readability = 1/(1+exp((10−12)/4)) = 0.62 |
| confidence | 1.0 | 300 words ≥ 100 |
| vocabWeight | 0.40 | |
| readWeight | 0.30 | |
| lengthWeight | 0.30 | |

Calculation:
```
combined = (0.69 × 0.40) + (0.62 × 0.30) + (0.78 × 0.30)
         = 0.276 + 0.186 + 0.234
         = 0.696

CQI = round(0.696 × 100) = 70 → "Good content quality" ✅ meets target ≥ 60
```

---

### Example B — Hero / CTA copy (35 words)

| Metric | Value | Notes |
|--------|-------|-------|
| totalWords | 35 | Section type: Hero/CTA → lengthWeight = 0 |
| uniqueWords | 30 | → vocabRatio = (30+10)/(35+20) = 0.73 |
| fleschKincaid | 8 | → readability = 0.73 |
| vocabWeight | 0.40 | fixed |
| readWeight | 0.30 | fixed |
| lengthWeight | 0.30 | fixed |
| lengthScore | 0.16 | 1 − exp(−35/200) — naturally small for 35 words |

Calculation:
```
combined = (0.73 × 0.40) + (0.73 × 0.30) + (0.16 × 0.30)
         = 0.292 + 0.219 + 0.048
         = 0.559

CQI = round(0.559 × 100) = 56 → ✅ meets Hero / CTA target ≥ 55
(length contributes only 0.048 — naturally tiny for 35 words)
```

---

### Example C — Short card / feature block (80 words, poor vocabulary)

| Metric | Value | Notes |
|--------|-------|-------|
| totalWords | 80 | → lengthScore = 1 − exp(−80/200) = 0.33 |
| uniqueWords | 35 | → vocabRatio = (35+10)/(80+20) = 0.45 |
| fleschKincaid | 14 | → readability = 1/(1+exp((14−12)/4)) = 0.38 |
| confidence | 0.80 | 80/100 |
| vocabWeight | 0.32 | |
| readWeight | 0.44 | |
| lengthWeight | 0.24 | |

Calculation:
```
combined = (0.45 × 0.32) + (0.38 × 0.44) + (0.33 × 0.24)
         = 0.144 + 0.167 + 0.079
         = 0.390

CQI = round(0.390 × 100) = 39 → "Poor content quality" ⚠️ below target ≥ 50
```

Suggestions: shorten sentences to improve readability; use more varied vocabulary; add ~70 more words to improve length score.

---

## 5. How to Present CQI to Stakeholders

| Metric | What to say |
|--------|-------------|
| Vocabulary | "The text reuses words too often — try replacing repeated phrases with more specific terms." |
| Readability | "Some sentences are complex — breaking them into 2–3 shorter sentences will improve the score." |
| Length | "At X words this section is below the recommended Y words for this content type." |
| Section target | "This type of content (card/feature) should aim for CQI ≥ 50. You are currently at 39." |
| CQI gain | "Applying all suggestions could raise CQI from 39 to approximately 55 (+16 points)." |

---

## 6. Additional Analyses (short, layman)

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

---

## 7. Technical Notes

| Topic | Detail |
|-------|--------|
| **LENGTH_SCALE** | Default is `200`. Controls how quickly length score saturates. At 200 words the length score is ~0.63; at 500 it is ~0.92. Set via env var `LENGTH_SCALE`. |
| **Bayesian smoothing** | `k=20`, `prior=0.5`. Prevents tiny texts (< 30 words) from showing an artificially high vocabulary score. |
| **Sampling** | For content > 5,000 words, only the first 5,000 are analysed. The API response includes `cqi.details.sampled` (true/false) and `cqi.details.sampleSize`. Set limit via env var `SAMPLE_WORD_LIMIT`. |
| **Hero/CTA mode** | When totalWords < 50, `lengthWeight` is set to 0 and the full remaining weight is absorbed by readability. This allows short-form copy to score fairly. |
| **Confidence** | `confidence = min(1, totalWords / 100)`. Under 100 words the vocab and length weights are partially reduced so the score is not unreliable for very short snippets. |
| **Reliability flag** | `cqi.reliable = false` for content under 30 words. The UI shows a warning in this case. |
| **Broken links mode** | Controlled by `BROKEN_LINK_MODE` env var: `off` (skip), `fast` (check up to `BROKEN_LINK_MAX_URLS` with short timeout), `sync` (check all). Other env vars: `BROKEN_LINK_MAX_URLS`, `BROKEN_LINK_TIMEOUT_MS`. |


