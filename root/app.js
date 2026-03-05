const form = document.getElementById("compareForm");
const output = document.getElementById("output");
const loader = document.getElementById("loader");
const status = document.getElementById("status");
const runMeta = document.getElementById("runMeta");
const apiPill = document.getElementById("apiPill");
const apiDot = document.getElementById("apiDot");
const apiLabel = document.getElementById("apiLabel");
const clearBtn = document.getElementById("clearBtn");
const toggleModeBtn = document.getElementById("toggleModeBtn"); // may be null now; legacy toggle
const cqiSection = document.getElementById("cqiSection");
const runCqiBtn = document.getElementById("runCqiBtn");
const cqiClearBtn = document.getElementById("cqiClearBtn");
const cqiPasted = document.getElementById("cqiPastedContent");
const howToBtn      = document.getElementById("howToBtn");
const howToModal    = document.getElementById("howToModal");
const howToClose    = document.getElementById("howToClose");
const howToCqiBtn   = document.getElementById("howToCqiBtn");
const howToCqiModal = document.getElementById("howToCqiModal");
const howToCqiClose = document.getElementById("howToCqiClose");
const loaderOverlay = document.getElementById("loaderOverlay");
const loaderTitle   = document.getElementById("loaderTitle");
const loaderSub     = document.getElementById("loaderSub");
const langSelect = document.getElementById("langSelect");
const heroTitle = document.querySelector(".hero__title");
const modeLanding = document.getElementById("modeLanding");
const modeCompareBtn = document.getElementById("modeCompareBtn");
const modeCqiBtn = document.getElementById("modeCqiBtn");
const modeOriginalityBtn = document.getElementById("modeOriginalityBtn");
const compareCard = document.getElementById("compareCard");
const compareBackBtn = document.getElementById("compareBackBtn");
const originalitySection = document.getElementById("originalitySection");
const toggleOriginalityBtn = document.getElementById("toggleOriginalityBtn");
const originalityBackBtn = document.getElementById("originalityBackBtn");
const runOriginalityBtn = document.getElementById("runOriginalityBtn");
const originalityClearBtn = document.getElementById("originalityClearBtn");
const originalityText = document.getElementById("originalityText");
const howToOriginalityBtn = document.getElementById("howToOriginalityBtn");
const howToOriginalityModal = document.getElementById("howToOriginalityModal");
const howToOriginalityClose = document.getElementById("howToOriginalityClose");

// Initialize language selector (persist in localStorage)
const LANG_KEY = "cqi_lang";
if (langSelect) {
  const saved = localStorage.getItem(LANG_KEY) || "en";
  langSelect.value = saved;
  langSelect.addEventListener("change", () => {
    localStorage.setItem(LANG_KEY, langSelect.value);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCqiSuggestionsHtml(cqi) {
  const d = (cqi && cqi.details) || {};
  const vocab = Number(d.vocabRatio ?? 0);
  const read = Number(d.readabilityScore ?? d.readability ?? 0);
  const length = Number(d.lengthScore ?? 0);
  const w = d.weights || {};
  const wV = Number(w.vocabWeight) || 0;
  const wR = Number(w.readWeight) || 0;
  const wL = Number(w.lengthWeight) || 0;

  const target = 0.6; // heuristic target (0–1 scale) for a “healthy” metric
  const suggestions = [];

  // Approximate potential CQI gain if this metric is lifted to target
  const potentialVocabGain = vocab < target ? Math.max(0, target - vocab) * wV * 100 : 0;
  const potentialReadGain = read < target ? Math.max(0, target - read) * wR * 100 : 0;
  const potentialLengthGain = length < target ? Math.max(0, target - length) * wL * 100 : 0;

  // Short, metric‑aware suggestions
  if (read < target && potentialReadGain > 0.5) {
    suggestions.push(
      `✔ <b>Sentences (readability)</b>: now <b>${read.toFixed(2)}</b>, aim ≈ <b>${target.toFixed(
        2
      )}</b> (≈ +${Math.round(
        potentialReadGain
      )} CQI). Break long sentences into 2–3 shorter ones and cut filler words such as very or really.`
    );
  }

  if (length < target && potentialLengthGain > 0.5) {
    suggestions.push(
      `✔ <b>Depth & structure</b>: now <b>${length.toFixed(2)}</b>, aim ≈ <b>${target.toFixed(
        2
      )}</b> (≈ +${Math.round(
        potentialLengthGain
      )} CQI). Add 1–2 short paragraphs that explain why this topic is important, include a simple example, or outline a short step‑by‑step list.`
    );
  }

  if (vocab < target && potentialVocabGain > 0.5) {
    suggestions.push(
      `✔ <b>Vocabulary (repetition)</b>: now <b>${vocab.toFixed(2)}</b>, aim ≈ <b>${target.toFixed(
        2
      )}</b> (≈ +${Math.round(
        potentialVocabGain
      )} CQI). Replace repeated phrases (for example generic praise like great product) with more specific wording that explains what is special.`
    );
  }

  let metricsLine = "";
  if (d.totalWords != null) {
    metricsLine = `Current metrics (0–1 scale, higher is better): vocab ${vocab.toFixed(
      2
    )}, readability ${read.toFixed(2)}, length/depth ${length.toFixed(2)}.`;
  }

  if (!suggestions.length) {
    suggestions.push(
      "✅ Your content already scores well on CQI. Focus on small tweaks to tone, style, and clarity."
    );
  }

  // Overall gain line, e.g. “CQI: 46 → ~72 (estimated gain: +26)”
  let gainLine = "";
  const baseScore =
    cqi && typeof cqi.score === "number"
      ? Number(cqi.score)
      : Math.round(Math.max(0, Math.min(1, (vocab * wV) + (read * wR) + (length * wL))) * 100);
  const totalPotentialGain = Math.round(potentialVocabGain + potentialReadGain + potentialLengthGain);
  if (totalPotentialGain > 1) {
    const targetScore = Math.max(0, Math.min(100, baseScore + totalPotentialGain));
    const gain = targetScore - baseScore;
    gainLine = `CQI: <b>${baseScore}</b> → ~<b>${targetScore}</b> (estimated gain: <b>+${gain}</b> after applying the changes above).`;
  }

  let html = '<div class="cqiSuggestions"><h4>Suggestions to improve CQI</h4><ul>';
  suggestions.forEach(item => {
    html += `<li>${item}</li>`;
  });
  html += "</ul>";
  if (metricsLine) {
    html += `<div class="cqiSuggestions__metrics">${metricsLine}</div>`;
  }
  if (gainLine) {
    html += `<div class="cqiSuggestions__gain">${gainLine}</div>`;
  }
  html += "</div>";
  return html;
}

function buildCqiCalcHtml(cqi) {
  const d = (cqi && cqi.details) || {};
  const totalWords = d.totalWords ?? "—";
  const vocabRatioNum = Number(d.vocabRatio) || 0;
  const readNum = Number(d.readabilityScore ?? d.readability) || 0;
  const lengthNum = Number(d.lengthScore) || 0;
  const w = d.weights || {};
  const wV = Number(w.vocabWeight) || 0;
  const wR = Number(w.readWeight) || 0;
  const wL = Number(w.lengthWeight) || 0;
  const compV = +(vocabRatioNum * wV).toFixed(4);
  const compR = +(readNum * wR).toFixed(4);
  const compL = +(lengthNum * wL).toFixed(4);
  const combinedCalc = +(compV + compR + compL).toFixed(4);
  const cqiScore = (typeof cqi.score === "number") ? cqi.score : Math.round(combinedCalc * 100);

  const rows = [
    ["Total words", totalWords],
    ["Sentences detected", d.sentenceCount ?? "—"],
    ["Avg. words per sentence", d.avgSentenceWords != null ? `${d.avgSentenceWords} words` : "—"],
    ["Sampled", d.sampled ? "Yes" : "No"],
    ["Unique words in sample", d.uniqueSample ?? d.uniqueWords ?? "—"],
    ["Vocabulary ratio (0–1)", d.vocabRatio ?? "—"],
    ["Readability score (0–1)", d.readabilityScore ?? d.readability ?? "—"],
    ["Length score (0–1)", d.lengthScore ?? "—"],
    ["Weights (vocab / readability / length)", d.weights ? `${d.weights.vocabWeight} / ${d.weights.readWeight} / ${d.weights.lengthWeight}` : "—"]
  ];

  let tableHtml = '<table class="calcTable"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>';
  rows.forEach(r => {
    tableHtml += `<tr><td>${escapeHtml(String(r[0]))}</td><td>${escapeHtml(String(r[1]))}</td></tr>`;
  });

  const rd = d.readabilityDetails || {};
  const fk = rd.fleschKincaid ?? rd.fleschKincaidGrade ?? rd.fleschKincaidGradeLevel;
  if (fk !== undefined) {
    tableHtml += `<tr><td>Flesch–Kincaid grade (reference only)</td><td>${escapeHtml(String(fk))} — not used in CQI calculation for IT content</td></tr>`;
  }

  tableHtml += `<tr><td>Vocabulary contribution</td><td>${escapeHtml(String(compV))} = ${escapeHtml(String(vocabRatioNum))} × ${escapeHtml(String(wV))}</td></tr>`;
  tableHtml += `<tr><td>Readability contribution</td><td>${escapeHtml(String(compR))} = ${escapeHtml(String(readNum))} × ${escapeHtml(String(wR))}</td></tr>`;
  tableHtml += `<tr><td>Length contribution</td><td>${escapeHtml(String(compL))} = ${escapeHtml(String(lengthNum))} × ${escapeHtml(String(wL))}</td></tr>`;
  tableHtml += `<tr><td><b>Combined (sum)</b></td><td><b>${escapeHtml(String(combinedCalc))}</b></td></tr>`;
  tableHtml += `<tr><td><b>CQI (rounded)</b></td><td><b>${escapeHtml(String(cqiScore))}</b> (round(${escapeHtml(String(combinedCalc))} × 100))</td></tr>`;
  tableHtml += '</tbody></table>';

  const explainHtml = `
    <div class="calcExplain">
      <p><b>How to read this in simple terms:</b></p>
      <ul>
        <li><b>Vocabulary ratio</b> (0–1) tells us how often you reuse the same words. Closer to <b>1.0</b> means you are using more varied and specific words.</li>
        <li><b>Readability score</b> (0–1) is based on average sentence length. IT content uses technical vocabulary by necessity, so syllable-count metrics like Flesch–Kincaid unfairly penalise it. Shorter, clearer sentences score higher. Aim for under 18 words per sentence.</li>
        <li><b>Length score</b> (0–1) tells us whether the content has enough substance. Very short texts with no explanation get a low score, fuller explanations get a higher one.</li>
        <li>The <b>weights</b> say how important each part is for CQI. For example, if vocabulary weight is 0.4, then vocabulary can contribute up to 40 of the 100 CQI points.</li>
        <li>We multiply each metric by its weight and add them up. This gives a number between 0 and 1. Then we turn that into a CQI between 0 and 100.</li>
        <li>For example, if vocabulary contribution is 0.18, readability 0.22 and length 0.15, the sum is 0.55. When we multiply 0.55 × 100 we get a CQI of about 55.</li>
      </ul>
    </div>
  `;

  tableHtml += `<div class="calcFormula">CQI = round(clamp(vocabRatio×${wV} + readability×${wR} + length×${wL}, 0,1) × 100) → <b>${escapeHtml(String(cqiScore))}</b></div>`;
  tableHtml += explainHtml;
  return tableHtml;
}

function buildLanguageToolHtml(languageTool) {
  const intro = [
    "LanguageTool checks: <b>spelling</b> · <b>grammar</b> · <b>context errors</b> · <b>repeated words</b> · <b>punctuation</b>.",
    "Fully free when <a href=\"https://languagetool.org\" target=\"_blank\" rel=\"noopener\">self-hosted</a>."
  ].join(" ");
  if (!languageTool || !languageTool.available) {
    const msg = languageTool?.message || "Not available";
    return `<div class="languageToolBlock"><h4>Spelling + grammar (LanguageTool)</h4><p class="languageToolCallout">${intro}</p><p class="languageToolStatus">${escapeHtml(msg)}</p></div>`;
  }
  const matches = languageTool.matches || [];
  if (matches.length === 0) {
    return `<div class="languageToolBlock"><h4>Spelling + grammar (LanguageTool)</h4><p class="languageToolCallout">${intro}</p><p class="languageToolStatus">No issues found.</p></div>`;
  }
  let html = `<div class="languageToolBlock"><h4>Spelling + grammar (LanguageTool)</h4><p class="languageToolCallout">${intro}</p><ul class="languageToolList">`;
  matches.slice(0, 20).forEach(m => {
    const frag = (m.fragment || "").trim() || "(fragment)";
    const msg = m.shortMessage || m.message || "Issue";
    const sugg = (m.replacements && m.replacements.length) ? ` → ${m.replacements.slice(0, 3).join(", ")}` : "";
    html += `<li><strong>${escapeHtml(frag)}</strong>: ${escapeHtml(msg)}${escapeHtml(sugg)}</li>`;
  });
  if (matches.length > 20) html += `<li class="languageToolMore">… and ${matches.length - 20} more.</li>`;
  if (languageTool.truncated) html += '<li class="languageToolWarn">Text was truncated to 20KB for the check.</li>';
  html += "</ul></div>";
  return html;
}

function highlightMisspellingsInHtml(html, words) {
  if (!words || words.length === 0) return html;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html || "";
  const pattern = '\\b(' + words.map(w => escapeRegExp(w)).join('|') + ')\\b';
  const regex = new RegExp(pattern, 'gi');

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (!text || !regex.test(text)) return;
      regex.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const idx = match.index;
        if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
        const span = document.createElement("span");
        span.className = "spelling-miss";
        span.textContent = match[0];
        frag.appendChild(span);
        lastIndex = idx + match[0].length;
      }
      if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      node.parentNode.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== "SCRIPT" && node.tagName !== "STYLE") {
      Array.from(node.childNodes).forEach(walk);
    }
  }

  Array.from(wrapper.childNodes).forEach(walk);
  return wrapper.innerHTML;
}

function computeMismatchPercent(expectedHtml, actualHtml) {
  const expectedWrap = document.createElement("div");
  expectedWrap.innerHTML = expectedHtml || "";

  const actualWrap = document.createElement("div");
  actualWrap.innerHTML = actualHtml || "";

  const removedChars = Array.from(expectedWrap.querySelectorAll(".removed"))
    .reduce((sum, el) => sum + (el.textContent || "").length, 0);

  const addedChars = Array.from(actualWrap.querySelectorAll(".added"))
    .reduce((sum, el) => sum + (el.textContent || "").length, 0);

  const expectedLen = (expectedWrap.textContent || "").length;
  const actualLen = (actualWrap.textContent || "").length;
  const denom = Math.max(expectedLen, actualLen, 1);

  const mismatch = ((removedChars + addedChars) / denom) * 100;
  return Math.max(0, Math.min(100, mismatch));
}

function getApiBaseFromQuery() {
  const api = new URLSearchParams(window.location.search).get("api");
  if (!api) return "";
  return api.replace(/\/+$/, "");
}

function getCompareUrl() {
  const apiBase = getApiBaseFromQuery();
  if (apiBase) return `${apiBase}/compare`;

  // GitHub Pages is static and does not support POST routes like /compare.
  const isGitHubPagesHost = window.location.hostname.endsWith(".github.io");
  if (isGitHubPagesHost) return "";

  // Local dev / hosted server: same-origin works.
  return "/compare";
}

function updateApiPill() {
  if (!apiPill || !apiDot || !apiLabel) return;
  const apiBase = getApiBaseFromQuery();
  if (apiBase) {
    apiDot.style.background = "rgba(109,255,180,0.92)";
    apiLabel.textContent = `Backend: ${apiBase}`;
  } else {
    apiDot.style.background = "rgba(255,255,255,0.35)";
    apiLabel.textContent = "Backend: not set";
  }
}

updateApiPill();

function setLoading(isLoading, mode = "compare") {
  if (loaderOverlay) {
    loaderOverlay.classList.toggle("isOpen", isLoading);
    loaderOverlay.setAttribute("aria-hidden", String(!isLoading));
  }
  if (isLoading && loaderTitle && loaderSub) {
    if (mode === "cqi") {
      loaderTitle.textContent = "Analysing content quality…";
      loaderSub.textContent   = "Calculating CQI score and suggestions…";
    } else if (mode === "originality") {
      loaderTitle.textContent = "Checking originality…";
      loaderSub.textContent   = "AI detection and plagiarism check…";
    } else {
      loaderTitle.textContent = "Running comparison";
      loaderSub.textContent   = "Fetching content and generating diff…";
    }
  }
}

// ---------- View helpers ----------
function showLandingView() {
  if (modeLanding) modeLanding.style.display = "";
  if (compareCard) compareCard.style.display = "none";
  if (cqiSection) cqiSection.style.display = "none";
  if (originalitySection) originalitySection.style.display = "none";
  if (output) output.innerHTML = "";
  if (status) status.innerHTML = "";
  if (runMeta) runMeta.innerHTML = "";
  if (heroTitle) heroTitle.textContent = "Choose what you want to check";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCompareView() {
  if (modeLanding) modeLanding.style.display = "none";
  if (compareCard) compareCard.style.display = "";
  if (cqiSection) cqiSection.style.display = "none";
  if (originalitySection) originalitySection.style.display = "none";
  if (toggleModeBtn) toggleModeBtn.textContent = "Check CQI Score Only";
  if (heroTitle) heroTitle.textContent = "Compare pasted content vs live website text";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCqiView() {
  if (modeLanding) modeLanding.style.display = "none";
  if (compareCard) compareCard.style.display = "none";
  if (originalitySection) originalitySection.style.display = "none";
  if (cqiSection) cqiSection.style.display = "";
  if (toggleModeBtn) toggleModeBtn.textContent = "Compare";
  if (heroTitle) heroTitle.textContent = "Check Content Quality (CQI) for your copy";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showOriginalityView() {
  if (modeLanding) modeLanding.style.display = "none";
  if (compareCard) compareCard.style.display = "none";
  if (cqiSection) cqiSection.style.display = "none";
  if (originalitySection) originalitySection.style.display = "";
  if (toggleModeBtn) toggleModeBtn.textContent = "Check CQI Score Only";
  if (heroTitle) heroTitle.textContent = "Check Originality (AI & Plagiarism)";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setHowToOpen(isOpen) {
  if (!howToModal) return;
  howToModal.classList.toggle("isOpen", isOpen);
  howToModal.setAttribute("aria-hidden", String(!isOpen));
}

if (howToBtn) howToBtn.addEventListener("click", () => setHowToOpen(true));
if (howToClose) howToClose.addEventListener("click", () => setHowToOpen(false));
if (howToModal) {
  howToModal.addEventListener("click", (e) => {
    if (e.target === howToModal) setHowToOpen(false);
  });
}

// CQI info modal
function setHowToCqiOpen(isOpen) {
  if (!howToCqiModal) return;
  howToCqiModal.classList.toggle("isOpen", isOpen);
  howToCqiModal.setAttribute("aria-hidden", String(!isOpen));
}
if (howToCqiBtn)   howToCqiBtn.addEventListener("click", () => setHowToCqiOpen(true));
if (howToCqiClose) howToCqiClose.addEventListener("click", () => setHowToCqiOpen(false));
if (howToCqiModal) {
  howToCqiModal.addEventListener("click", (e) => {
    if (e.target === howToCqiModal) setHowToCqiOpen(false);
  });
}
function setHowToOriginalityOpen(isOpen) {
  if (!howToOriginalityModal) return;
  howToOriginalityModal.classList.toggle("isOpen", isOpen);
  howToOriginalityModal.setAttribute("aria-hidden", String(!isOpen));
}
if (howToOriginalityBtn) howToOriginalityBtn.addEventListener("click", () => setHowToOriginalityOpen(true));
if (howToOriginalityClose) howToOriginalityClose.addEventListener("click", () => setHowToOriginalityOpen(false));
if (howToOriginalityModal) {
  howToOriginalityModal.addEventListener("click", (e) => {
    if (e.target === howToOriginalityModal) setHowToOriginalityOpen(false);
  });
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { setHowToOpen(false); setHowToCqiOpen(false); setHowToOriginalityOpen(false); }
});

// Back button on Compare view → Home
if (compareBackBtn) {
  compareBackBtn.addEventListener("click", () => {
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    showLandingView();
  });
}

// Landing mode buttons
if (modeCompareBtn) {
  modeCompareBtn.addEventListener("click", () => {
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    showCompareView();
  });
}
if (modeCqiBtn) {
  modeCqiBtn.addEventListener("click", () => {
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    resetCqiUi();
    showCqiView();
  });
}
if (modeOriginalityBtn) {
  modeOriginalityBtn.addEventListener("click", () => {
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    showOriginalityView();
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    form.reset();
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    updateApiPill();
  });
}

// Toggle between Compare mode and CQI-only mode
if (toggleModeBtn && cqiSection) {
  toggleModeBtn.addEventListener("click", () => {
    const isCqiVisible = cqiSection.style.display !== "none";
    if (isCqiVisible) {
      // switching FROM CQI view back TO Compare view
      // Clear any CQI / analysis output so Compare page starts fresh
      output.innerHTML = "";
      status.innerHTML = "";
      if (runMeta) runMeta.innerHTML = "";

      cqiSection.style.display = "none";
      if (originalitySection) originalitySection.style.display = "none";
      showCompareView();
    } else {
      // switching FROM Compare view TO CQI-only view
      // Clear Compare output so CQI page shows only CQI results
      output.innerHTML = "";
      status.innerHTML = "";
      if (runMeta) runMeta.innerHTML = "";
      resetCqiUi();
      if (originalitySection) originalitySection.style.display = "none";

      showCqiView();
    }
  });
}

// Toggle to Originality Check mode
if (toggleOriginalityBtn && originalitySection) {
  toggleOriginalityBtn.addEventListener("click", () => {
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    if (cqiSection) cqiSection.style.display = "none";
    showOriginalityView();
  });
}

if (originalityBackBtn && originalitySection) {
  originalityBackBtn.addEventListener("click", () => {
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    originalitySection.style.display = "none";
    if (cqiSection) cqiSection.style.display = "none";
    // Return to landing so user can choose another mode
    showLandingView();
  });
}

// Back button in CQI view
const cqiBackBtn = document.getElementById("cqiBackBtn");
if (cqiBackBtn) {
  cqiBackBtn.addEventListener("click", () => {
    // Going back to landing view: clear CQI/analysis output so landing is fresh
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    resetCqiUi();
    if (originalitySection) originalitySection.style.display = "none";

    // show landing
    cqiSection.style.display = "none";
    showLandingView();
  });
}

// Live word count + section type + warning as user types
const wordCountNum     = document.getElementById("wordCountNum");
const wordCountSection = document.getElementById("wordCountSection");
const wordCountWarning = document.getElementById("wordCountWarning");

function getSectionInfo(wordCount) {
  if (wordCount < 50)   return { type: "Hero / Tagline",              target: 55, color: "#f59e0b", warn: "Short-form copy — only vocabulary and readability are scored." };
  if (wordCount < 100)  return { type: "Service Card / Feature",      target: 55, color: "#3b82f6", warn: "Aim for 100+ words for a more complete CQI evaluation." };
  if (wordCount < 200)  return { type: "Section Intro / About",       target: 60, color: "#0ea5e9", warn: "" };
  if (wordCount < 500)  return { type: "Page Section / Landing Copy", target: 65, color: "#10b981", warn: "" };
  if (wordCount < 1000) return { type: "Case Study / Blog Post",      target: 70, color: "#8b5cf6", warn: "" };
  return                       { type: "Technical Article / Whitepaper", target: 72, color: "#6366f1", warn: "" };
}

function updateWordCount() {
  if (!cqiPasted || !wordCountNum) return;
  const words = (cqiPasted.value.trim().match(/\S+/g) || []).length;
  const info   = getSectionInfo(words);
  wordCountNum.textContent = `${words} word${words !== 1 ? "s" : ""}`;
  if (wordCountSection) {
    wordCountSection.textContent = words > 0 ? `· ${info.type} · Target CQI ≥ ${info.target}` : "";
    wordCountSection.style.color = info.color;
  }
  if (wordCountWarning) {
    wordCountWarning.textContent = info.warn;
  }
}

function resetCqiUi() {
  if (cqiPasted) cqiPasted.value = "";
  if (wordCountNum) wordCountNum.textContent = "0 words";
  if (wordCountSection) {
    wordCountSection.textContent = "";
    wordCountSection.style.color = "";
  }
  if (wordCountWarning) {
    wordCountWarning.textContent = "";
  }
}

if (cqiPasted) {
  cqiPasted.addEventListener("input", updateWordCount);
}

if (cqiClearBtn && cqiPasted) {
  cqiClearBtn.addEventListener("click", () => {
    resetCqiUi();
    // clear outputs
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    updateApiPill();
  });
}

if (runOriginalityBtn && originalityText) {
  runOriginalityBtn.addEventListener("click", async () => {
    const text = originalityText.value || "";
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    setLoading(true, "originality");
    if (!text.trim()) {
      setLoading(false, "originality");
      status.innerHTML = `<span class="fail">❌ Paste some content first</span>`;
      return;
    }
    try {
      const apiBase = getApiBaseFromQuery();
      const url = apiBase ? `${apiBase}/originality` : "/originality";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ text }),
        mode: "cors",
        cache: "no-cache"
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLoading(false, "originality");
      const ai = data.aiDetection || {};
      const plag = data.plagiarism || {};
      const aiScore = ai.aiScore != null ? ai.aiScore : null;
      const humanScore = ai.humanScore != null ? ai.humanScore : null;
      const plagScore = plag.score != null ? plag.score : null;
      let statusCls = "pass";
      if (aiScore != null && aiScore >= 70) statusCls = "fail";
      else if (aiScore != null && aiScore >= 40) statusCls = "warn";
      let statusHtml = "";
      if (ai.available && aiScore != null) {
        statusHtml = `<span class="${statusCls}">AI: ${aiScore}% · Human: ${humanScore}%</span>`;
        if (plagScore != null) statusHtml += ` <span class="muted">· Plagiarism (originality): ${plagScore}%</span>`;
      } else {
        statusHtml = ai.message ? `<span class="warn">${escapeHtml(ai.message)}</span>` : "";
        if (plagScore != null) statusHtml += ` <span class="muted">Plagiarism (originality): ${plagScore}%</span>`;
      }
      status.innerHTML = statusHtml || `<span class="muted">Done</span>`;

      let blocks = "";
      if (ai.available) {
        blocks += `
          <div class="metric originalityMetric">
            <div class="metric__label">AI-generated</div>
            <div class="metric__value">${aiScore != null ? aiScore + "%" : "—"}</div>
            <div class="metric__sub">${ai.label ? escapeHtml(ai.label) : (ai.message || "—")}</div>
            ${aiScore != null && humanScore != null ? `<div class="metric__note">Human-written score: ${humanScore}%</div>` : ""}
          </div>`;
      } else {
        blocks += `
          <div class="metric originalityMetric">
            <div class="metric__label">AI detection</div>
            <div class="metric__value">—</div>
            <div class="metric__sub">${escapeHtml(ai.message || "Not available")}</div>
          </div>`;
      }
      blocks += `
        <div class="metric originalityMetric">
          <div class="metric__label">Plagiarism (originality)</div>
          <div class="metric__value">${plagScore != null ? plagScore + "%" : "—"}</div>
          <div class="metric__sub">${escapeHtml(plag.message || "Compared to previously checked content.")}</div>
          ${plag.similarityPercent != null ? `<div class="metric__note">Max similarity to stored content: ${plag.similarityPercent}%</div>` : ""}
        </div>`;
      output.innerHTML = `
        <div class="metricsRow">
          <h3>Originality results</h3>
          <div class="metricsGrid">${blocks}</div>
        </div>`;
    } catch (err) {
      setLoading(false, "originality");
      console.error("Originality error:", err);
      status.innerHTML = `<span class="fail">❌ ${escapeHtml(err.message || err.toString())}</span>`;
    }
  });
}

if (originalityClearBtn && originalityText) {
  originalityClearBtn.addEventListener("click", () => {
    originalityText.value = "";
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
  });
}

if (runCqiBtn) {
  runCqiBtn.addEventListener("click", async () => {
    const pasted = cqiPasted.value || "";
    // Always clear previous results so each run shows fresh data only
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    setLoading(true, "cqi");
    if (!pasted.trim()) {
      setLoading(false, "cqi");
      status.innerHTML = `<span class="fail">❌ Paste some content first</span>`;
      return;
    }

    try {
      const apiBase = getApiBaseFromQuery();
      const url = apiBase ? `${apiBase}/cqi` : "/cqi";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ pastedContent: pasted, lang: (langSelect && langSelect.value) || 'en' }),
        mode: "cors",
        cache: "no-cache"
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setLoading(false, "cqi");
      const cqi = data.cqi;
      if (!cqi) {
        status.innerHTML = `<span class="fail">❌ No CQI returned</span>`;
        return;
      }

      const sType    = cqi.sectionType || "";
      const sTarget  = cqi.targetCQI  || 0;
      const sNote    = cqi.sectionNote || "";
      const cqiStatus = cqi.status || "";   // "exceeds" | "meets" | "near" | "needs_improvement" | "poor"

      // Status → icon + CSS class
      const statusMap = {
        exceeds:          { icon: "🏆", cls: "sectionTarget--exceeds", label: `Excellent — well above target (CQI ${cqi.score}, target ≥ ${sTarget})` },
        meets:            { icon: "✅", cls: "sectionTarget--pass",    label: `Meets the ${escapeHtml(sType)} content quality target (CQI ${cqi.score} ≥ ${sTarget})` },
        near:             { icon: "🔶", cls: "sectionTarget--near",    label: `Almost there — just ${sTarget - cqi.score} point${sTarget - cqi.score !== 1 ? "s" : ""} below target (CQI ${cqi.score}, aim ≥ ${sTarget})` },
        needs_improvement:{ icon: "⚠️", cls: "sectionTarget--fail",   label: `Needs improvement — ${sTarget - cqi.score} points below the ${escapeHtml(sType)} target (CQI ${cqi.score}, aim ≥ ${sTarget})` },
        poor:             { icon: "❌", cls: "sectionTarget--poor",    label: `Significantly below target — content needs substantial rework (CQI ${cqi.score}, target ≥ ${sTarget})` },
      };
      const st = statusMap[cqiStatus] || statusMap["needs_improvement"];

      const targetBadge = sTarget > 0
        ? `<span class="sectionBadge" title="${escapeHtml(sNote)}">${escapeHtml(sType)} · Target ≥ ${sTarget}</span>`
        : "";
      const targetLine = sTarget > 0
        ? `<div class="sectionTarget ${st.cls}">${st.icon} ${st.label}</div>`
        : "";

      // Simple SEO hint based on CQI vs target
      const seoHintHtml = (() => {
        if (!sTarget) return "";
        const meets = cqiStatus === "exceeds" || cqiStatus === "meets";
        if (meets) {
          return `<div class="metric__note metric__note--seo-ok"><b>SEO hint: Content quality meets the CQI target for this section. This is generally healthy for on-page SEO.</b></div>`;
        }
        return `<div class="metric__note metric__note--seo-bad"><b>SEO hint: CQI is below the target for this section. Improving readability, vocabulary, and depth will also support better on-page SEO.</b></div>`;
      })();

      // Top status bar (compact: only show icon + CQI score)
      const statusCls = (cqiStatus === "exceeds" || cqiStatus === "meets") ? "pass"
                      : (cqiStatus === "near") ? "warn"
                      : "fail";
      status.innerHTML = `<span class="${statusCls}">${st.icon} CQI: ${cqi.score}</span>`;
      // render CQI card + calculation toggle
      output.innerHTML = `
        <div class="metricsRow">
          <h3>Pasted Content CQI ${targetBadge}</h3>
          ${targetLine}
          <div class="metricsGrid">
            <div class="metric cqiMetric">
              <div class="metric__label">CQI</div>
              <div class="metric__value">${cqi.score}</div>
              <div class="metric__sub">${escapeHtml(cqi.summary)}</div>
              ${cqi.reliable === false ? '<div class="metric__warn">Unreliable (short text)</div>' : ''}
              ${sNote ? `<div class="metric__note">${escapeHtml(sNote)}</div>` : ""}
              ${seoHintHtml}
              <button class="calcToggle" id="showCalcBtn" type="button">Show calculation</button>
              <div class="calcDetails" id="calcDetails" style="display:none;"></div>
            </div>
          </div>
          <div id="cqiSuggestions" class="cqiSuggestions"></div>
        </div>
      `;
      // show pasted content preview with spelling highlights (if available)
      const spelling = data.spelling || {};
      const miss = (spelling.topMisspellings || []).map(s => s.word).filter(Boolean);
      let pastedPreviewHtml = escapeHtml(pasted);
      if (miss.length > 0) {
        try {
          // use a temporary element to apply spans
          const tmp = document.createElement("div");
          tmp.textContent = pasted;
          pastedPreviewHtml = highlightMisspellingsInHtml(escapeHtml(pasted), miss);
        } catch (e) {
          pastedPreviewHtml = escapeHtml(pasted);
        }
      }
      const previewNode = document.createElement("div");
      previewNode.className = "pastedPreview";
      previewNode.innerHTML = pastedPreviewHtml;
      // wrap in a container with heading
      const previewBlock = document.createElement("div");
      previewBlock.className = "pastedPreviewBlock";
      previewBlock.innerHTML = '<div class="pastedPreviewTitle">Pasted content (spelling check view)</div>';
      previewBlock.appendChild(previewNode);
      // append preview after metrics
      const metricsContainer = output.querySelector(".metricsRow");
      if (metricsContainer) metricsContainer.appendChild(previewBlock);

      const ltHtml = buildLanguageToolHtml(data.languageTool || {});
      if (ltHtml && metricsContainer) {
        const ltWrap = document.createElement("div");
        ltWrap.innerHTML = ltHtml;
        metricsContainer.appendChild(ltWrap.firstElementChild);
      }

      // suggestions for improving CQI
      const suggNode = document.getElementById("cqiSuggestions");
      if (suggNode) {
        suggNode.innerHTML = buildCqiSuggestionsHtml(cqi);
      }

      // attach calc toggle (same logic as compare flow)
      const showCalcBtn = document.getElementById("showCalcBtn");
      if (showCalcBtn && cqi) {
        showCalcBtn.addEventListener("click", () => {
          const details = document.getElementById("calcDetails");
          if (!details) return;
          const isHidden = details.style.display === "none";
          if (isHidden) {
            try {
              details.innerHTML = buildCqiCalcHtml(cqi);
            } catch (e) {
              details.innerHTML = `<pre>${escapeHtml(JSON.stringify(cqi.details, null, 2))}</pre>`;
            }
            details.style.display = "block";
            showCalcBtn.textContent = "Hide calculation";
          } else {
            details.style.display = "none";
            showCalcBtn.textContent = "Show calculation";
          }
        });
      }

    } catch (err) {
      setLoading(false, "cqi");
      console.error("CQI error:", err);
      status.innerHTML = `<span class="fail">❌ ${escapeHtml(err.message || err.toString())}</span>`;
    }
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Always clear previous results so each run shows fresh data only
  output.innerHTML = "";
  status.innerHTML = "";
  if (runMeta) runMeta.innerHTML = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  setLoading(true);

  const formData = new FormData(form);
  const url = formData.get("url").trim();
  const locator = formData.get("locator").trim();
  const type = formData.get("type");
  const pastedContent = formData.get("pastedContent");

  try {
    new URL(url);
  } catch {
    setLoading(false);
    status.innerHTML = `<span class="fail">❌ Invalid URL. Please enter a valid website URL (e.g. https://example.com/page).</span>`;
    return;
  }

  // Validate locator
  if (!locator) {
    setLoading(false);
    const typeLabel = type === "xpath" ? "XPath" : type === "css" ? "CSS selector" : type === "id" ? "element ID" : "locator";
    status.innerHTML = `<span class="fail">❌ ${typeLabel} is missing. Please enter a ${typeLabel} value in the Locator field before running the comparison.</span>`;
    return;
  }

  // Validate pasted content
  if (!pastedContent || !pastedContent.trim()) {
    setLoading(false);
    status.innerHTML = `<span class="fail">❌ Pasted (Expected) content is empty. Please paste the expected text before running the comparison.</span>`;
    return;
  }

  try {
    const compareUrl = getCompareUrl();
    if (!compareUrl) {
      setLoading(false);
      status.innerHTML =
        `<span class="fail">GitHub Pages can’t run the backend. Add <b>?api=https://YOUR_BACKEND</b> to the URL and try again.</span>`;
      return;
    }

    const res = await fetch(compareUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ url, locator, type, pastedContent, lang: (langSelect && langSelect.value) || 'en' }),
      mode: 'cors', // Explicitly enable CORS
      cache: 'no-cache'
    });

    // Check response status before parsing
    if (!res.ok) {
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${res.status}: ${res.statusText}` };
      }
      setLoading(false);
      status.innerHTML = `<span class="fail">❌ ${errorData.error || 'Request failed'}</span>`;
      return;
    }

    const data = await res.json();
    setLoading(false);

    // PASS / FAIL decision (character-level diff)
    const isFail =
      data.expectedHtml.includes("removed") ||
      data.actualHtml.includes("added");

    const mismatchPercent = computeMismatchPercent(data.expectedHtml, data.actualHtml);
    const mismatchText = `Mismatch: ${mismatchPercent.toFixed(2)}%`;

    // CQI (pasted content) and other analyses
    const cqi = data.cqi || null;
    // Simple SEO hint based on CQI vs target
    const seoHintHtml = (() => {
      if (!cqi || !cqi.targetCQI) return "";
      const statusKey = cqi.status || "";
      const meets = statusKey === "exceeds" || statusKey === "meets";
      if (meets) {
        return `<div class="metric__note metric__note--seo-ok"><b>SEO hint: Content quality meets the CQI target for this section. This is generally healthy for on-page SEO.</b></div>`;
      }
      return `<div class="metric__note metric__note--seo-bad"><b>SEO hint: CQI is below the target for this section. Improving readability, vocabulary, and depth will also support better on-page SEO.</b></div>`;
    })();

    // Only show CQI in the UI per client request.
    const cqiHtml = cqi
      ? `<div class="metric cqiMetric">
           <div class="metric__label">CQI</div>
           <div class="metric__value">${cqi.score}</div>
           <div class="metric__sub">${escapeHtml(cqi.summary)}</div>
           ${cqi.reliable === false ? '<div class="metric__warn">Unreliable (short text)</div>' : ''}
           ${seoHintHtml}
           <button class="calcToggle" id="showCalcBtn" type="button">Show calculation</button>
           <div class="calcDetails" id="calcDetails" style="display:none;"></div>
         </div>`
      : `<div class="metric"><div class="metric__label">CQI</div><div class="metric__value">–</div><div class="metric__sub">No data</div></div>`;

    status.innerHTML = isFail
      ? `<span class="fail">❌ FAILED – Content mismatch (${mismatchText})</span>`
      : `<span class="pass">✅ PASSED – Content matches (${mismatchText})</span>`;

    if (runMeta) {
      runMeta.innerHTML = `
        <div><b>URL:</b> ${escapeHtml(url)}</div>
        <div><b>Locator:</b> ${escapeHtml(locator)} <b>Type:</b> ${escapeHtml(type)}</div>
      `;
    }

    // Highlight spelling mistakes in expectedHtml if present
    let expectedHtmlHighlighted = data.expectedHtml;
    const spelling = data.spelling || {};
    const miss = (spelling.topMisspellings || []).map(s => s.word).filter(Boolean);
    if (miss.length > 0) {
      try {
        expectedHtmlHighlighted = highlightMisspellingsInHtml(data.expectedHtml, miss);
      } catch (e) {
        // fallback to raw expectedHtml if highlighting fails
        expectedHtmlHighlighted = data.expectedHtml;
      }
    }

    // Side-by-side render + metrics panel (applies to pasted content only)
    output.innerHTML = `
      <div class="diffGrid">
        <div class="diffCol">
          <h3>Pasted (Expected)</h3>
          <div>${expectedHtmlHighlighted}</div>
        </div>
        <div class="diffCol">
          <h3>From URL (Actual)</h3>
          <div>${data.actualHtml}</div>
        </div>
      </div>
      <div class="metricsRow">
        <h3>Pasted Content Analysis</h3>
        <div class="metricsGrid">
          ${cqiHtml}
        </div>
        <div id="compareCqiSuggestions" class="cqiSuggestions"></div>
        <div id="compareLanguageTool"></div>
      </div>
    `;

    const ltHtml = buildLanguageToolHtml(data.languageTool || {});
    const compareLt = document.getElementById("compareLanguageTool");
    if (compareLt && ltHtml) compareLt.innerHTML = ltHtml;

    // Attach toggle handler for showing calculation details
    const showCalcBtn = document.getElementById("showCalcBtn");
    if (showCalcBtn && cqi) {
      showCalcBtn.addEventListener("click", () => {
        const details = document.getElementById("calcDetails");
        if (!details) return;
        const isHidden = details.style.display === "none";
        if (isHidden) {
          try {
            details.innerHTML = buildCqiCalcHtml(cqi);
          } catch (e) {
            details.innerHTML = `<pre>${escapeHtml(JSON.stringify(cqi.details, null, 2))}</pre>`;
          }
          details.style.display = "block";
          showCalcBtn.textContent = "Hide calculation";
        } else {
          details.style.display = "none";
          showCalcBtn.textContent = "Show calculation";
        }
      });
    }

    // Attach suggestions for improving CQI in compare mode
    const compareSuggNode = document.getElementById("compareCqiSuggestions");
    if (compareSuggNode && cqi) {
      compareSuggNode.innerHTML = buildCqiSuggestionsHtml(cqi);
    }

  } catch (err) {
    setLoading(false);
    console.error("Comparison error:", err);
    
    // More detailed error messages for connection issues
    let errorMsg = "❌ Comparison failed";
    const apiBase = getApiBaseFromQuery();
    
    if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("ERR_CONNECTION_CLOSED") || err.name === "TypeError")) {
      if (apiBase) {
        errorMsg = `❌ Cannot connect to backend at ${escapeHtml(apiBase)}<br>
          <div style="margin-top: 8px; font-size: 13px; line-height: 1.6;">
            <b>Possible issues:</b><br>
            • Render service is sleeping (free tier sleeps after 15 min - first request takes ~30s)<br>
            • Check if backend URL is correct<br>
            • Verify the service is running in Render dashboard<br>
            • Try accessing <a href="${escapeHtml(apiBase)}/health" target="_blank">${escapeHtml(apiBase)}/health</a> directly
          </div>`;
      } else {
        errorMsg = `❌ No backend API configured. Add <b>?api=https://YOUR_RENDER_URL</b> to the URL`;
      }
    } else if (err.message && (err.message.includes("NetworkError") || err.message.includes("network"))) {
      errorMsg = "❌ Network error - check your internet connection";
    } else {
      errorMsg = `❌ Error: ${err.message || err.toString()}`;
    }
    
    status.innerHTML = `<span class="fail">${errorMsg}</span>`;
  }
});
