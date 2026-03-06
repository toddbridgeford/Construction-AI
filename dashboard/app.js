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

function isSubsectionError(value) {
  return !!(value && typeof value === "object" && value.ok === false && value.error);
}

function asText(value, fallback = "unknown") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function marketFromList(list) {
  return Array.isArray(list) && list[0]?.market ? list[0].market : "unknown";
}

function modelFromSettled(results) {
  const terminal = settledValue(results.terminal, "terminal") || {};
  const power = {
    power_index: settledValue(results.power, "power_index") || terminal.power_index || null,
    power_summary: settledValue(results.power, "power_summary") || terminal.power_summary || null,
  };

  const marketTape = terminal.market_tape || null;
  const terminalSignal = isSubsectionError(terminal.signal) ? null : terminal.signal;
  const terminalRegime = isSubsectionError(terminal.regime) ? null : terminal.regime;
  const terminalLiquidity = isSubsectionError(terminal.liquidity) ? null : terminal.liquidity;
  const terminalRisk = isSubsectionError(terminal.risk) ? null : terminal.risk;
  const spendingSummary = settledValue(results.spendingSummary, "summary");
  const spending = spendingSummary || (isSubsectionError(terminal.spending) ? null : terminal.spending);

  return {
    terminal,
    tape: marketTape,
    signal: asText(terminalSignal?.signal, "unknown"),
    regime: asText(terminalRegime?.regime, "unknown"),
    liquidity: asText(terminalLiquidity?.liquidity_state, asText(marketTape?.liquidity, "unknown")),
    risk: asText(terminalRisk?.risk_level, asText(marketTape?.risk, "unknown")),
    constructionIndex: asNumber(terminal.construction_index),
    stressIndex: settledValue(results.stressIndex, "stress_index") || terminal.stress_index || null,
    spending,
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
    cycleInterpretation: asText(terminal.cycle_interpretation, "Neutral"),
    marketTape: marketTape || {
      signal: asText(terminalSignal?.signal, "unknown"),
      regime: asText(terminalRegime?.regime, "unknown"),
      liquidity: asText(terminalLiquidity?.liquidity_state, "unknown"),
      risk: asText(terminalRisk?.risk_level, "unknown"),
      construction_index: asNumber(terminal.construction_index),
      stress_index: asNumber(terminal.stress_index?.score),
      recession_probability: asNumber(terminal.recession_probability?.next_12_months),
      commercial_pct: asNumber(spending?.commercial?.pct_change_ytd_vs_pytd),
      housing_pct: asNumber(spending?.housing?.pct_change_ytd_vs_pytd),
      top_market: marketFromList(terminal.migration_index?.inbound_markets),
      weakest_market: marketFromList(terminal.migration_index?.outbound_markets),
    },
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
  const commercial = asNumber(vm.spending?.commercial?.pct_change_ytd_vs_pytd);
  const housing = asNumber(vm.spending?.housing?.pct_change_ytd_vs_pytd);
  const powerHeadline = vm.power?.power_summary?.headline || "Power summary unavailable";
  const heatmapSummary = vm.heatmap?.ok === false
    ? asText(vm.heatmap?.error?.message, "Heatmap unavailable")
    : asText(vm.heatmap?.summary?.top_strength_theme, asText(vm.terminal?.heatmap_summary?.top_strength_theme, "Heatmap unavailable"));
  const forecastHeadline = asText(vm.forecast?.summary?.headline, asText(vm.terminal?.forecast_summary?.headline, "Forecast unavailable"));
  const stressValue = asNumber(vm.stressIndex?.score) ?? "n/a";
  const commercialHousingTakeaway = commercial !== null && housing !== null
    ? commercial >= 0 && housing >= 0
      ? "Both segments are above prior-year pace."
      : commercial < 0 && housing < 0
        ? "Both segments are below prior-year pace."
        : "Segments are diverging; stay selective by market."
    : "Segment data unavailable.";
  const projectPipeline = vm.nowcast?.next_6_months === "softening"
    ? "Pipeline bias: cautious"
    : vm.liquidity === "tight"
      ? "Pipeline bias: selective"
      : "Pipeline bias: stable";
  const bidEnvironment = vm.constructionIndex !== null && vm.constructionIndex >= 55
    ? "Competitive"
    : vm.liquidity === "tight"
      ? "Disciplined"
      : "Balanced";
  const subCapacity = vm.power?.power_index?.subcontractors?.state || "unknown";
  const topAlerts = Array.from(new Map((vm.alerts || []).map((a) => [a.headline, a])).values());
  const migrationInbound = marketFromList(vm.migrationIndex?.inbound_markets);
  const migrationOutbound = marketFromList(vm.migrationIndex?.outbound_markets);
  const operatorActions = vm.operatorActions
    ? `GC: ${vm.operatorActions.gc} Sub: ${vm.operatorActions.subcontractor} Dev: ${vm.operatorActions.developer} Lender: ${vm.operatorActions.lender}`
    : "GC: Protect backlog quality. Sub: Maintain pricing discipline. Dev: Stage starts by financing certainty. Lender: Monitor commercial exposures.";

  panelsEl.innerHTML = `
    <section class="row row-top">${card("Cycle Dial", vm.cycleInterpretation)}${card("Signal", vm.signal)}${card("Regime", vm.regime)}${card("Liquidity", vm.liquidity)}${card("Risk", vm.risk)}${card("Construction Index", vm.constructionIndex ?? "n/a")}${card("Stress Index", stressValue, vm.stressIndex?.explanation || "")}</section>
    <section class="row">${card("Commercial vs Housing", `${commercial ?? "n/a"} / ${housing ?? "n/a"}`, commercialHousingTakeaway)}${card("Power Index", vm.power?.power_summary?.margin_leader || "unknown", powerHeadline)}${card("Forward Outlook", vm.nowcast?.next_6_months || "unknown", `Recession: ${vm.recessionProbability?.next_12_months ?? "n/a"}%`)}${card("Project Pipeline", projectPipeline, vm.nowcast?.drivers?.[0] || "No driver available")}</section>
    <section class="row">${card("Alerts", topAlerts?.[0]?.headline || "No active alerts", topAlerts?.[0]?.explanation || "")}${card("Heatmap", heatmapSummary, asText(vm.terminal?.heatmap_summary?.top_weakness_theme, ""))}${card("Bid Environment", bidEnvironment, vm.terminal?.power_summary?.headline || "")}${card("Subcontractor Capacity", subCapacity, vm.power?.power_index?.subcontractors?.explanation || "")}</section>
    <section class="row">${card("Capital Flows", vm.capitalFlows?.headline || "unknown", vm.capitalFlows?.explanation || vm.terminal?.capital_flows_summary || "")}${card("Migration Index", `${migrationInbound} → ${migrationOutbound}`, vm.migrationIndex?.headline || vm.terminal?.migration_summary || "")}${card("Market Forecast", asText(vm.terminal?.forecast_summary?.strongest_market, marketFromList(vm.forecast?.strongest_next_12_months)), forecastHeadline)}</section>
    <section class="row row-bottom">${card("Morning Brief", vm.morningBrief?.spending?.takeaway || "Unavailable")} ${card("Operator Actions", operatorActions)}</section>
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
