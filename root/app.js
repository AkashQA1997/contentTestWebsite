const form = document.getElementById("compareForm");
const output = document.getElementById("output");
const loader = document.getElementById("loader");
const status = document.getElementById("status");
const runMeta = document.getElementById("runMeta");
const apiPill = document.getElementById("apiPill");
const apiDot = document.getElementById("apiDot");
const apiLabel = document.getElementById("apiLabel");
const clearBtn = document.getElementById("clearBtn");
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

    // PASS / FAIL decision
    const isFail =
      data.expectedHtml.includes("removed") ||
      data.actualHtml.includes("added");

    const mismatchPercent = computeMismatchPercent(data.expectedHtml, data.actualHtml);
    const mismatchText = `Mismatch: ${mismatchPercent.toFixed(2)}%`;

    // Meaning drift information (rule-based only)
    const drift = data.meaningDrift || { score: 0, summary: "" };
    const driftText = drift.score !== undefined 
      ? `<div class="status__meta">🧠 Meaning drift: <b>${drift.score}%</b>${drift.summary ? ` – ${escapeHtml(drift.summary)}` : ""}</div>`
      : "";

    status.innerHTML = isFail
      ? `<span class="fail">❌ FAILED – Content mismatch (${mismatchText})</span>${driftText}`
      : `<span class="pass">✅ PASSED – Content matches (${mismatchText})</span>${driftText}`;

    if (runMeta) {
      runMeta.innerHTML = `
        <div><b>URL:</b> ${escapeHtml(url)}</div>
        <div><b>Locator:</b> ${escapeHtml(locator)} <b>Type:</b> ${escapeHtml(type)}</div>
      `;
    }

    // Side-by-side render
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
    `;

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
