const API_BASE = window.DASHBOARD_API_BASE || "";
const REFRESH_MS = 60_000;

const ENDPOINTS = {
  terminal: `${API_BASE}/construction/terminal`,
  power: `${API_BASE}/construction/power`,
  heatmap: `${API_BASE}/construction/heatmap`,
  forecast: `${API_BASE}/construction/forecast`,
  nowcast: `${API_BASE}/construction/nowcast`,
  alerts: `${API_BASE}/construction/alerts`,
  morningBrief: `${API_BASE}/construction/morning-brief`,
  recessionProbability: `${API_BASE}/construction/recession-probability`,
  stressIndex: `${API_BASE}/construction/stress-index`,
  earlyWarning: `${API_BASE}/construction/early-warning`,
  capitalFlows: `${API_BASE}/construction/capital-flows`,
  migrationIndex: `${API_BASE}/construction/migration-index`,
  spendingSummary: `${API_BASE}/spending/ytd/summary`,
};

const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const tapeEl = document.getElementById("marketTape");
const panelsEl = document.getElementById("panels");

let refreshHandle;

function setStatus(message) {
  statusEl.textContent = message;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function settledValue(result, key) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value?.[key] ?? null;
}

function modelFromSettled(results) {
  const terminal = settledValue(results.terminal, "terminal") || {};
  const power = {
    power_index: settledValue(results.power, "power_index") || terminal.power_index || null,
    power_summary: settledValue(results.power, "power_summary") || terminal.power_summary || null,
  };

  return {
    terminal,
    tape: terminal.market_tape || null,
    signal: terminal.signal?.signal || "unknown",
    regime: terminal.regime?.regime || "unknown",
    liquidity: terminal.liquidity?.liquidity_state || "unknown",
    risk: terminal.risk?.risk_score ?? null,
    constructionIndex: terminal.construction_index ?? null,
    stressIndex: settledValue(results.stressIndex, "stress_index") || terminal.stress_index || null,
    spending: settledValue(results.spendingSummary, "summary") || terminal.spending || null,
    power,
    nowcast: settledValue(results.nowcast, "nowcast") || terminal.nowcast || null,
    heatmap: settledValue(results.heatmap, "heatmap") || null,
    forecast: settledValue(results.forecast, "forecast") || null,
    alerts: settledValue(results.alerts, "alerts") || terminal.alerts || [],
    recessionProbability: settledValue(results.recessionProbability, "recession_probability") || terminal.recession_probability || null,
    earlyWarning: settledValue(results.earlyWarning, "early_warning") || terminal.early_warning || null,
    capitalFlows: settledValue(results.capitalFlows, "capital_flows") || terminal.capital_flows || null,
    migrationIndex: settledValue(results.migrationIndex, "migration_index") || terminal.migration_index || null,
    morningBrief: settledValue(results.morningBrief, "brief") || null,
    operatorActions: terminal.operator_actions || null,
    cycleInterpretation: terminal.cycle_interpretation || "Neutral",
    marketTape: terminal.market_tape || null,
    failures: Object.entries(results)
      .filter(([, value]) => value.status === "rejected")
      .map(([key, value]) => ({ key, reason: value.reason?.message || "failed" })),
  };
}

async function useConstructionTerminalData() {
  const entries = Object.entries(ENDPOINTS);
  const settled = await Promise.allSettled(entries.map(([, url]) => fetchJson(url)));
  const results = {};
  entries.forEach(([name], index) => {
    results[name] = settled[index];
  });
  return modelFromSettled(results);
}

function card(title, value, subtitle = "") {
  return `<article class="card"><h3>${title}</h3><div class="value">${value}</div><p>${subtitle || ""}</p></article>`;
}

function renderTape(tape) {
  tapeEl.innerHTML = "";
  const activeTape = tape || {};
  const fields = [
    ["Signal", activeTape.signal || "unknown"],
    ["Regime", activeTape.regime || "unknown"],
    ["Liquidity", activeTape.liquidity || "unknown"],
    ["Risk", activeTape.risk ?? "n/a"],
    ["Construction", activeTape.construction_index ?? "n/a"],
    ["Stress", activeTape.stress_index ?? "n/a"],
    ["Recession %", activeTape.recession_probability ?? "n/a"],
    ["Commercial %", activeTape.commercial_pct ?? "n/a"],
    ["Housing %", activeTape.housing_pct ?? "n/a"],
    ["Top Market", activeTape.top_market || "unknown"],
    ["Weakest Market", activeTape.weakest_market || "unknown"],
  ];

  fields.forEach(([label, value]) => {
    const span = document.createElement("span");
    span.className = "tape-item";
    span.innerHTML = `<strong>${label}</strong> ${value}`;
    tapeEl.appendChild(span);
  });
}

function renderPanels(vm) {
  const commercial = vm.spending?.commercial?.pct_change_ytd_vs_pytd;
  const housing = vm.spending?.housing?.pct_change_ytd_vs_pytd;
  const powerHeadline = vm.power?.power_summary?.headline || "Power summary unavailable";
  const heatmapSummary = vm.heatmap?.summary?.top_strength_theme || vm.terminal?.heatmap_summary?.top_strength_theme || "Heatmap unavailable";
  const forecastHeadline = vm.forecast?.summary?.headline || vm.terminal?.forecast_summary?.headline || "Forecast unavailable";

  panelsEl.innerHTML = `
    <section class="row row-top">${card("Cycle Dial", vm.cycleInterpretation)}${card("Signal", vm.signal)}${card("Regime", vm.regime)}${card("Liquidity", vm.liquidity)}${card("Risk", vm.risk ?? "n/a")}${card("Construction Index", vm.constructionIndex ?? "n/a")}${card("Stress Index", vm.stressIndex?.stress_index ?? "n/a", vm.stressIndex?.explanation || "")}</section>
    <section class="row">${card("Commercial vs Housing", `${commercial ?? "n/a"} / ${housing ?? "n/a"}`)}${card("Power Index", vm.power?.power_summary?.margin_leader || "unknown", powerHeadline)}${card("Forward Outlook", vm.nowcast?.next_6_months || "unknown", `Recession: ${vm.recessionProbability?.next_12_months ?? "n/a"}%`)}${card("Project Pipeline", vm.nowcast?.drivers?.[0] || "No driver available")}</section>
    <section class="row">${card("Alerts", vm.alerts?.[0]?.headline || "No active alerts", vm.alerts?.[0]?.explanation || "")}${card("Heatmap", vm.terminal?.heatmap_summary?.top_strength_theme || "No heatmap", heatmapSummary)}${card("Bid Environment", vm.signal, vm.terminal?.power_summary?.headline || "")}${card("Subcontractor Capacity", vm.power?.power_index?.subcontractors?.state || "unknown", vm.power?.power_index?.subcontractors?.explanation || "")}</section>
    <section class="row">${card("Capital Flows", vm.capitalFlows?.flow_regime || "unknown", vm.capitalFlows?.explanation || vm.terminal?.capital_flows_summary || "")}${card("Migration Index", vm.migrationIndex?.migration_index ?? "n/a", vm.migrationIndex?.explanation || vm.terminal?.migration_summary || "")}${card("Market Forecast", vm.terminal?.forecast_summary?.strongest_market || "unknown", forecastHeadline)}</section>
    <section class="row row-bottom">${card("Morning Brief", vm.morningBrief?.spending?.takeaway || "Unavailable")} ${card("Operator Actions", Object.values(vm.operatorActions || {}).join(" "))}</section>
  `;
}

function renderFailures(failures) {
  if (!failures.length) return;
  const failed = failures.map((f) => `${f.key}: ${f.reason}`).join(" | ");
  setStatus(`Partial data mode — ${failed}`);
}

async function loadDashboard() {
  setStatus("Refreshing terminal...");
  try {
    const vm = await useConstructionTerminalData();
    renderTape(vm.marketTape || vm.tape);
    renderPanels(vm);

    if (vm.failures.length) {
      renderFailures(vm.failures);
    } else {
      setStatus(`Updated ${new Date().toLocaleTimeString()}`);
    }
  } catch (error) {
    setStatus(`Terminal load error: ${error.message}`);
  }
}

refreshBtn.addEventListener("click", loadDashboard);
loadDashboard();
refreshHandle = setInterval(loadDashboard, REFRESH_MS);
window.addEventListener("beforeunload", () => clearInterval(refreshHandle));
