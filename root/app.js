const form = document.getElementById("compareForm");
const output = document.getElementById("output");
const loader = document.getElementById("loader");
const status = document.getElementById("status");
const notice = document.getElementById("notice");
const useBackend = document.getElementById("useBackend");
const backendFields = document.getElementById("backendFields");

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getApiBase() {
  // Example: https://USER.github.io/REPO/?api=https://your-backend.example.com
  const api = new URLSearchParams(window.location.search).get("api");
  if (!api) return "";
  return api.replace(/\/+$/, "");
}

function compareEndpoint() {
  const apiBase = getApiBase();
  return apiBase ? `${apiBase}/compare` : "/compare";
}

// Simple, fast diff: common prefix + common suffix, highlight middle.
function prefixSuffixDiff(expected, actual) {
  const a = expected;
  const b = actual;
  const minLen = Math.min(a.length, b.length);

  let start = 0;
  while (start < minLen && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const prefix = a.slice(0, start);
  const aMid = a.slice(start, endA + 1);
  const bMid = b.slice(start, endB + 1);
  const suffix = a.slice(endA + 1);

  const expectedHtml =
    escapeHtml(prefix) +
    (aMid ? `<span class="removed">${escapeHtml(aMid)}</span>` : "") +
    escapeHtml(suffix);

  const actualHtml =
    escapeHtml(prefix) +
    (bMid ? `<span class="added">${escapeHtml(bMid)}</span>` : "") +
    escapeHtml(suffix);

  return { expectedHtml, actualHtml };
}

function setModeUi() {
  backendFields.style.display = useBackend.checked ? "grid" : "none";
}

function renderResult(expectedHtml, actualHtml) {
  const isFail =
    expectedHtml.includes('class="removed"') ||
    actualHtml.includes('class="added"');

  status.innerHTML = isFail
    ? `<span class="fail">❌ FAILED – Content mismatch</span>`
    : `<span class="pass">✅ PASSED – Content matches</span>`;

  output.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h3>Expected</h3>
        <div class="mono">${expectedHtml}</div>
      </div>
      <div class="card">
        <h3>Actual</h3>
        <div class="mono">${actualHtml}</div>
      </div>
    </div>
  `;
}

function setNotice() {
  const apiBase = getApiBase();
  if (apiBase) {
    notice.innerHTML = `Backend API set to <code>${escapeHtml(apiBase)}</code>. You can enable "Use backend fetch".`;
  } else {
    notice.innerHTML = `GitHub Pages can’t run the Node/Playwright server. Use Manual mode (paste Actual text), or provide <code>?api=https://YOUR_BACKEND</code> to use backend fetch.`;
  }
}

useBackend.addEventListener("change", () => {
  setModeUi();
});

setModeUi();
setNotice();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  output.innerHTML = "";
  status.innerHTML = "";
  loader.style.display = "block";

  const formData = new FormData(form);
  const expectedRaw = formData.get("expected");
  const actualRaw = formData.get("actual");

  const expected = normalizeText(expectedRaw);

  try {
    if (!useBackend.checked) {
      const actual = normalizeText(actualRaw);
      loader.style.display = "none";

      if (!actual) {
        status.innerHTML = `<span class="fail">❌ Please paste Actual content (or enable backend mode)</span>`;
        return;
      }

      const { expectedHtml, actualHtml } = prefixSuffixDiff(expected, actual);
      renderResult(expectedHtml, actualHtml);
      return;
    }

    // Backend mode: fetch actual text via hosted API.
    const url = String(formData.get("url") || "").trim();
    const locator = String(formData.get("locator") || "").trim();
    const type = String(formData.get("type") || "").trim();

    if (!url || !locator || !type) {
      loader.style.display = "none";
      status.innerHTML = `<span class="fail">❌ Fill URL + locator + type (backend mode)</span>`;
      return;
    }

    try {
      new URL(url);
    } catch {
      loader.style.display = "none";
      status.innerHTML = `<span class="fail">❌ Invalid URL</span>`;
      return;
    }

    const res = await fetch(compareEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, locator, type, pastedContent: expected })
    });

    const data = await res.json().catch(() => ({}));
    loader.style.display = "none";

    if (!res.ok) {
      status.innerHTML = `<span class="fail">❌ ${escapeHtml(data.error || "Request failed")}</span>`;
      return;
    }

    // Backend returns already-diffed html spans; render directly.
    renderResult(data.expectedHtml || "", data.actualHtml || "");
  } catch (err) {
    loader.style.display = "none";
    console.error(err);
    status.innerHTML = `<span class="fail">❌ Comparison failed</span>`;
  }
});


