# Meaning Drift Assessment Documentation

## Overview

The Meaning Drift feature analyzes the **semantic quality** of your pasted content. It evaluates vocabulary diversity, content structure, and overall semantic richness to provide a quality score.

### Formula
```
diversityScore = uniqueWords / totalWords
driftFromIdeal = 1 - diversityScore
lengthScore = min(1, totalWords / 50)
lengthDrift = 1 - lengthScore
combinedDrift = (driftFromIdeal × 0.7) + (lengthDrift × 0.3)
driftScore = round(combinedDrift × 100)

## How It Works

The assessment analyzes **only the pasted content** (not comparing it to the actual content from the URL). It uses two main metrics:

### 1. Vocabulary Diversity (70% weight)
- **Metric**: Unique words / Total words
- **Higher diversity** = Lower drift (better quality)
- **Lower diversity** = Higher drift (more repetitive)

### 2. Content Length (30% weight)
- **Metric**: Total words / 50 (normalized)
- **Longer content** = Lower drift (more comprehensive)
- **Shorter content** = Higher drift (less detailed)

## Score Interpretation

| Drift Score | Quality Level | Description |
|------------|--------------|-------------|
| **0-20%** | 🟢 **High** | Rich vocabulary and good content structure |
| **20-40%** | 🟡 **Good** | Adequate vocabulary diversity |
| **40-60%** | 🟠 **Moderate** | Some repetition or limited vocabulary |
| **60-80%** | 🔴 **Low** | Significant repetition or poor structure |
| **80-100%** | ⚫ **Very Low** | Highly repetitive or minimal meaningful content |

## Example Calculations

### Example 1: High Quality Content
**Content:** "Founded in 2010, We believe in building a future where People, Process, and Technology, drive lasting change. Whatever we do is rooted in customer-centricity. We deliver tailored solutions that enhance your business performance and secure competitive advantages amid disruptions."

**Metrics:**
- 29 unique words out of 31 total
- Diversity: 93.5% (very high)
- Length: 31 words (moderate)

**Calculation:**
- Diversity drift: (1 - 0.935) × 0.7 = 4.55%
- Length drift: (1 - 0.62) × 0.3 = 11.4%
- **Total drift: 16%** → "High semantic quality"

### Example 2: Repetitive Content
**Content:** "Great product. Great service. Great quality. Great value. Great experience."

**Metrics:**
- 2 unique words out of 10 total
- Diversity: 20% (very low)
- Length: 10 words (short)

**Calculation:**
- Diversity drift: (1 - 0.20) × 0.7 = 56%
- Length drift: (1 - 0.20) × 0.3 = 24%
- **Total drift: 80%** → "Very low semantic quality"

## What Gets Analyzed

The system:
1. **Tokenizes** the text (splits into words)
2. **Filters** stop words (the, a, is, etc.) and short words (< 3 characters)
3. **Stems** words (running → run, better → bett)
4. **Counts** unique vs total meaningful words
5. **Calculates** diversity and length scores
6. **Combines** metrics with weighted average

## Understanding the Output

When you see:
```
🧠 Meaning drift (rule-based): 16% – High semantic quality - rich vocabulary and good content structure (29 unique words, 31 total words)
```

This means:
- **16% drift**: Low drift = High quality
- **Assessment**: High semantic quality
- **29 unique words**: Out of 31 total meaningful words
- **93.5% diversity**: Very high vocabulary variety

## Tips for Better Scores

To achieve lower drift (higher quality) scores:

1. **Use diverse vocabulary** - Avoid repeating the same words
2. **Write comprehensive content** - Aim for 50+ meaningful words for full length score
3. **Vary sentence structure** - Use different word patterns
4. **Include specific terms** - Technical terms and domain-specific vocabulary help

## Technical Details

### Formula
```
diversityScore = uniqueWords / totalWords
driftFromIdeal = 1 - diversityScore
lengthScore = min(1, totalWords / 50)
lengthDrift = 1 - lengthScore
combinedDrift = (driftFromIdeal × 0.7) + (lengthDrift × 0.3)
driftScore = round(combinedDrift × 100)
```

### Word Processing
- **Stop words removed**: Common words like "the", "a", "is", "and", etc.
- **Short words filtered**: Words with less than 3 characters
- **Stemming applied**: Words reduced to root form (e.g., "running" → "run")
- **Case insensitive**: All text converted to lowercase

## AI Verification (Optional)

If you have an API key configured (OpenAI, Gemini, Groq, or Hugging Face), the system also provides AI-based semantic analysis as a double-check. This appears as:

```
🤖 AI verification [PROVIDER]: X% drift – [AI-generated summary]
```

The AI analysis compares the pasted content with the actual content from the URL to detect semantic differences.

## FAQ

**Q: Why is my drift score high even though my content looks good?**
A: The score considers both vocabulary diversity and length. Short content (even if well-written) will have a higher drift score due to the length component.

**Q: Can I get 0% drift?**
A: Very unlikely. 0% would require perfect diversity (every word unique) and very long content. Most quality content scores 10-30%.

**Q: Does this check grammar or spelling?**
A: No, this only analyzes semantic quality (vocabulary diversity and content structure), not grammar or spelling.

**Q: What's the difference between rule-based and AI verification?**
A: 
- **Rule-based**: Analyzes only pasted content quality (vocabulary diversity, length)
- **AI verification**: Compares pasted content vs actual URL content for semantic differences

## Related Features

- **Content Comparison**: The main feature compares pasted content with live website content
- **Character-level Diff**: Highlights exact text differences
- **Mismatch Percentage**: Shows percentage of characters that differ

