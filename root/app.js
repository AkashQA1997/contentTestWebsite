const form = document.getElementById("compareForm");
const output = document.getElementById("output");
const loader = document.getElementById("loader");
const status = document.getElementById("status");

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  output.innerHTML = "";
  status.innerHTML = "";
  loader.style.display = "block";

  const formData = new FormData(form);
  const url = formData.get("url").trim();
  const locator = formData.get("locator").trim();
  const type = formData.get("type");
  const pastedContent = formData.get("pastedContent");

  try {
    new URL(url);
  } catch {
    loader.style.display = "none";
    status.innerHTML = `<span class="fail">❌ Invalid URL</span>`;
    return;
  }

  try {
    const compareUrl = getCompareUrl();
    if (!compareUrl) {
      loader.style.display = "none";
      status.innerHTML =
        `<span class="fail">❌ GitHub Pages can’t run the backend. Add <b>?api=https://YOUR_BACKEND</b> to the URL (a hosted copy of this repo’s Node server) and try again.</span>`;
      return;
    }

    const res = await fetch(compareUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, locator, type, pastedContent })
    });

    const data = await res.json();
    loader.style.display = "none";

    if (!res.ok) {
      status.innerHTML = `<span class="fail">❌ ${data.error}</span>`;
      return;
    }

    // PASS / FAIL decision
    const isFail =
      data.expectedHtml.includes("removed") ||
      data.actualHtml.includes("added");

    status.innerHTML = isFail
      ? `<span class="fail">❌ FAILED – Content mismatch</span>`
      : `<span class="pass">✅ PASSED – Content matches</span>`;

    // Side-by-side render
    output.innerHTML = `
      <div style="display:flex; gap:20px">
        <div style="width:50%">
          <h3>Expected</h3>
          <div>${data.expectedHtml}</div>
        </div>
        <div style="width:50%">
          <h3>Actual</h3>
          <div>${data.actualHtml}</div>
        </div>
      </div>
    `;

  } catch (err) {
    loader.style.display = "none";
    console.error(err);
    status.innerHTML = `<span class="fail">❌ Comparison failed</span>`;
  }
});
