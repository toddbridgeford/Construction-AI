const API_BASE = window.DASHBOARD_API_BASE || "";
const ENDPOINT = `${API_BASE}/api/dashboard`;
const REFRESH_MS = 60_000;

const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const tickerStrip = document.getElementById("tickerStrip");
const newsList = document.getElementById("newsList");
const constructionList = document.getElementById("constructionList");
const signalsList = document.getElementById("signalsList");

let refreshHandle;

function setStatus(message) {
  statusEl.textContent = message;
}

function emptyItem(text) {
  const li = document.createElement("li");
  li.className = "muted";
  li.textContent = text;
  return li;
}

function renderTickers(tickers = []) {
  tickerStrip.innerHTML = "";
  if (!tickers.length) {
    tickerStrip.appendChild(emptyItem("No ticker data yet."));
    return;
  }

  tickers.forEach((ticker) => {
    const card = document.createElement("article");
    const directionClass = ticker.change > 0 ? "up" : ticker.change < 0 ? "down" : "muted";
    card.className = "ticker";
    card.innerHTML = `
      <strong>${ticker.symbol}</strong><br />
      <span>${Number(ticker.price).toFixed(2)}</span><br />
      <span class="${directionClass}">${ticker.change >= 0 ? "+" : ""}${Number(ticker.change).toFixed(2)} (${Number(ticker.changePct).toFixed(2)}%)</span>
    `;
    tickerStrip.appendChild(card);
  });
}

function renderList(target, items, renderer, emptyText) {
  target.innerHTML = "";
  if (!items?.length) {
    target.appendChild(emptyItem(emptyText));
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = renderer(item);
    target.appendChild(li);
  });
}

async function loadDashboard() {
  setStatus("Refreshing...");
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    renderTickers(payload.tickers || []);
    renderList(
      newsList,
      payload.news,
      (item) => `<a href="${item.url}" target="_blank" rel="noreferrer">${item.title}</a><div class="muted">${item.source} • ${new Date(item.publishedAt).toLocaleString()}</div>`,
      "No news available."
    );
    renderList(
      constructionList,
      payload.construction,
      (item) => `<strong>${item.title}</strong><div class="muted">${item.value} • ${item.source}</div>`,
      "Construction panel waiting for source integrations."
    );
    renderList(
      signalsList,
      payload.signals,
      (item) => `<strong>${item.name}</strong><div class="muted">${item.value} • ${item.direction}</div>`,
      "Signals panel waiting for model outputs."
    );

    setStatus(`Updated ${new Date(payload.generated_at).toLocaleTimeString()}`);
  } catch (error) {
    setStatus(`Error loading dashboard: ${error.message}`);
  }
}

refreshBtn.addEventListener("click", loadDashboard);

loadDashboard();
refreshHandle = setInterval(loadDashboard, REFRESH_MS);
window.addEventListener("beforeunload", () => clearInterval(refreshHandle));
