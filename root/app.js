const form = document.getElementById("compareForm");
const output = document.getElementById("output");
const loader = document.getElementById("loader");
const status = document.getElementById("status");
const runMeta = document.getElementById("runMeta");
const apiPill = document.getElementById("apiPill");
const apiDot = document.getElementById("apiDot");
const apiLabel = document.getElementById("apiLabel");
const clearBtn = document.getElementById("clearBtn");
const toggleModeBtn = document.getElementById("toggleModeBtn");
const cqiSection = document.getElementById("cqiSection");
const runCqiBtn = document.getElementById("runCqiBtn");
const cqiClearBtn = document.getElementById("cqiClearBtn");
const cqiPasted = document.getElementById("cqiPastedContent");
const howToBtn = document.getElementById("howToBtn");
const howToModal = document.getElementById("howToModal");
const howToClose = document.getElementById("howToClose");
const loaderOverlay = document.getElementById("loaderOverlay");

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function setLoading(isLoading) {
  if (loaderOverlay) {
    loaderOverlay.classList.toggle("isOpen", isLoading);
    loaderOverlay.setAttribute("aria-hidden", String(!isLoading));
  }
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
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setHowToOpen(false);
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
      // show compare form
      cqiSection.style.display = "none";
      document.querySelector("section.card").style.display = ""; // the compare card
      toggleModeBtn.textContent = "CQI only";
    } else {
      // show CQI only
      cqiSection.style.display = "";
      document.querySelector("section.card").style.display = "none";
      toggleModeBtn.textContent = "Compare";
    }
  });
}

if (cqiClearBtn && cqiPasted) {
  cqiClearBtn.addEventListener("click", () => {
    cqiPasted.value = "";
    // clear outputs
    output.innerHTML = "";
    status.innerHTML = "";
    if (runMeta) runMeta.innerHTML = "";
    updateApiPill();
  });
}

if (runCqiBtn) {
  runCqiBtn.addEventListener("click", async () => {
    const pasted = cqiPasted.value || "";
    output.innerHTML = "";
    status.innerHTML = "";
    setLoading(true);
    if (!pasted.trim()) {
      setLoading(false);
      status.innerHTML = `<span class="fail">❌ Paste some content first</span>`;
      return;
    }

    try {
      const apiBase = getApiBaseFromQuery();
      const url = apiBase ? `${apiBase}/cqi` : "/cqi";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ pastedContent: pasted }),
        mode: "cors",
        cache: "no-cache"
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setLoading(false);
      const cqi = data.cqi;
      if (!cqi) {
        status.innerHTML = `<span class="fail">❌ No CQI returned</span>`;
        return;
      }

      status.innerHTML = `<span class="pass">✅ CQI: ${cqi.score} — ${escapeHtml(cqi.summary)}</span>`;
      // render CQI card + calculation toggle (reuse HTML fragment)
      output.innerHTML = `
        <div class="metricsRow">
          <h3>Pasted Content CQI</h3>
          <div class="metricsGrid">
            <div class="metric cqiMetric">
              <div class="metric__label">CQI</div>
              <div class="metric__value">${cqi.score}</div>
              <div class="metric__sub">${escapeHtml(cqi.summary)}</div>
              ${cqi.reliable === false ? '<div class="metric__warn">Unreliable (short text)</div>' : ''}
              <button class="calcToggle" id="showCalcBtn" type="button">Show calculation</button>
              <div class="calcDetails" id="calcDetails" style="display:none;"></div>
            </div>
          </div>
        </div>
      `;

      // attach calc toggle (same logic as compare flow)
      const showCalcBtn = document.getElementById("showCalcBtn");
      if (showCalcBtn) {
        showCalcBtn.addEventListener("click", () => {
          const details = document.getElementById("calcDetails");
          if (!details) return;
          const isHidden = details.style.display === "none";
          if (isHidden) {
            try {
              const d = cqi.details || {};
              const rows = [
                ["Sampled", d.sampled ? "Yes" : "No"],
                ["Sample size", d.sampleSize ?? d.totalWords ?? "—"],
                ["Unique words (sample)", d.uniqueSample ?? d.uniqueWords ?? "—"],
                ["Vocabulary ratio", d.vocabRatio ?? "—"],
                ["Readability score", d.readabilityScore ?? d.readability ?? "—"],
                ["Length score", d.lengthScore ?? "—"],
                ["Weights (vocab / read / length)", d.weights ? `${d.weights.vocabWeight} / ${d.weights.readWeight} / ${d.weights.lengthWeight}` : "—"]
              ];

              let tableHtml = '<table class="calcTable"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>';
              rows.forEach(r => {
                tableHtml += `<tr><td>${escapeHtml(String(r[0]))}</td><td>${escapeHtml(String(r[1]))}</td></tr>`;
              });
              const rd = d.readabilityDetails || {};
              const fk = rd.fleschKincaid ?? rd.fleschKincaidGrade ?? rd.fleschKincaidGradeLevel;
              if (fk !== undefined) {
                tableHtml += `<tr><td>Flesch–Kincaid (library)</td><td>${escapeHtml(String(fk))}</td></tr>`;
              }

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

              tableHtml += `<tr><td>Vocabulary contribution</td><td>${escapeHtml(String(compV))} = ${escapeHtml(String(vocabRatioNum))} × ${escapeHtml(String(wV))}</td></tr>`;
              tableHtml += `<tr><td>Readability contribution</td><td>${escapeHtml(String(compR))} = ${escapeHtml(String(readNum))} × ${escapeHtml(String(wR))}</td></tr>`;
              tableHtml += `<tr><td>Length contribution</td><td>${escapeHtml(String(compL))} = ${escapeHtml(String(lengthNum))} × ${escapeHtml(String(wL))}</td></tr>`;
              tableHtml += `<tr><td><b>Combined (sum)</b></td><td><b>${escapeHtml(String(combinedCalc))}</b></td></tr>`;
              tableHtml += `<tr><td><b>CQI (rounded)</b></td><td><b>${escapeHtml(String(cqiScore))}</b> (round(${escapeHtml(String(combinedCalc))} × 100))</td></tr>`;
              tableHtml += '</tbody></table>';
              tableHtml += `<div class="calcFormula">CQI = round(clamp(vocabRatio×${wV} + readability×${wR} + length×${wL}, 0,1) × 100) → <b>${escapeHtml(String(cqiScore))}</b></div>`;
              details.innerHTML = tableHtml;
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
      setLoading(false);
      console.error("CQI error:", err);
      status.innerHTML = `<span class="fail">❌ ${escapeHtml(err.message || err.toString())}</span>`;
    }
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  output.innerHTML = "";
  status.innerHTML = "";
  if (runMeta) runMeta.innerHTML = "";
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
    status.innerHTML = `<span class="fail">❌ Invalid URL</span>`;
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
      body: JSON.stringify({ url, locator, type, pastedContent }),
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
    // Only show CQI in the UI per client request.
    const cqiHtml = cqi
      ? `<div class="metric cqiMetric">
           <div class="metric__label">CQI</div>
           <div class="metric__value">${cqi.score}</div>
           <div class="metric__sub">${escapeHtml(cqi.summary)}</div>
           ${cqi.reliable === false ? '<div class="metric__warn">Unreliable (short text)</div>' : ''}
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

    // Side-by-side render + metrics panel (applies to pasted content only)
    output.innerHTML = `
      <div class="diffGrid">
        <div class="diffCol">
          <h3>Pasted (Expected)</h3>
          <div>${data.expectedHtml}</div>
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
      </div>
    `;

    // Attach toggle handler for showing calculation details
    const showCalcBtn = document.getElementById("showCalcBtn");
    if (showCalcBtn) {
      showCalcBtn.addEventListener("click", () => {
        const details = document.getElementById("calcDetails");
        if (!details) return;
        const isHidden = details.style.display === "none";
        if (isHidden) {
          // Populate human-friendly table
          try {
            const d = cqi.details || {};
            const rows = [
              ["Total words", d.totalWords ?? "—"],
              ["Sampled", d.sampled ? "Yes" : "No"],
              ["Sample size", d.sampleSize ?? d.totalWords ?? "—"],
              ["Unique words (sample)", d.uniqueSample ?? d.uniqueWords ?? "—"],
              ["Vocabulary ratio", d.vocabRatio ?? "—"],
              ["Readability score", d.readabilityScore ?? d.readability ?? "—"],
              ["Length score", d.lengthScore ?? "—"],
              ["Weights (vocab / read / length)", d.weights ? `${d.weights.vocabWeight} / ${d.weights.readWeight} / ${d.weights.lengthWeight}` : "—"]
            ];

            let tableHtml = '<table class="calcTable"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>';
            rows.forEach(r => {
              tableHtml += `<tr><td>${escapeHtml(String(r[0]))}</td><td>${escapeHtml(String(r[1]))}</td></tr>`;
            });

            // Readability details (flesch-kincaid if present)
            const rd = d.readabilityDetails || {};
            const fk = rd.fleschKincaid ?? rd.fleschKincaidGrade ?? rd.fleschKincaidGradeLevel;
            if (fk !== undefined) {
              tableHtml += `<tr><td>Flesch–Kincaid (library)</td><td>${escapeHtml(String(fk))}</td></tr>`;
            }

            // Show how the weighted components produce the final CQI
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

            tableHtml += `<tr><td>Vocabulary contribution</td><td>${escapeHtml(String(compV))} = ${escapeHtml(String(vocabRatioNum))} × ${escapeHtml(String(wV))}</td></tr>`;
            tableHtml += `<tr><td>Readability contribution</td><td>${escapeHtml(String(compR))} = ${escapeHtml(String(readNum))} × ${escapeHtml(String(wR))}</td></tr>`;
            tableHtml += `<tr><td>Length contribution</td><td>${escapeHtml(String(compL))} = ${escapeHtml(String(lengthNum))} × ${escapeHtml(String(wL))}</td></tr>`;
            tableHtml += `<tr><td><b>Combined (sum)</b></td><td><b>${escapeHtml(String(combinedCalc))}</b></td></tr>`;
            tableHtml += `<tr><td><b>CQI (rounded)</b></td><td><b>${escapeHtml(String(cqiScore))}</b> (round(${escapeHtml(String(combinedCalc))} × 100))</td></tr>`;

            tableHtml += '</tbody></table>';
            // Add a small human-readable formula block
            tableHtml += `<div class="calcFormula">CQI = round(clamp(vocabRatio×${wV} + readability×${wR} + length×${wL}, 0,1) × 100) → <b>${escapeHtml(String(cqiScore))}</b></div>`;
            details.innerHTML = tableHtml;
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
