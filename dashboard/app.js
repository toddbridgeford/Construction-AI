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
  const payload = unwrapPayload(result.value);
  if (payload && typeof payload === "object") {
    if (payload[key] !== undefined) return payload[key];
    if (payload.data && typeof payload.data === "object" && payload.data[key] !== undefined) return payload.data[key];
  }
  return null;
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.data && typeof payload.data === "object") return payload.data;
  return payload;
}

function readNestedValue(source, key) {
  if (!source || typeof source !== "object") return null;
  if (source[key] !== undefined) return source[key];

  const nestedContainers = [source.data, source.payload, source.value, source.result];
  for (const container of nestedContainers) {
    if (container && typeof container === "object" && container[key] !== undefined) {
      return container[key];
    }
  }

  return null;
}

function asObject(value) {
  return value && typeof value === "object" ? value : null;
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

function formatOneDecimal(value, fallback = "n/a") {
  const numeric = asNumber(value);
  return numeric === null ? fallback : numeric.toFixed(1);
}

function isUnavailableText(value, unavailableLabel) {
  return typeof value === "string" && value.toLowerCase().includes(unavailableLabel.toLowerCase());
}

function marketFromList(list) {
  return Array.isArray(list) && list[0]?.market ? list[0].market : "unknown";
}

function modelFromSettled(results) {
  const terminal = asObject(settledValue(results.terminal, "terminal")) || {};
  const power = {
    power_index: settledValue(results.power, "power_index") || readNestedValue(terminal, "power_index") || null,
    power_summary: settledValue(results.power, "power_summary") || readNestedValue(terminal, "power_summary") || null,
  };

  const marketTape = readNestedValue(terminal, "market_tape") || null;
  const terminalSignalSection = readNestedValue(terminal, "signal");
  const terminalRegimeSection = readNestedValue(terminal, "regime");
  const terminalLiquiditySection = readNestedValue(terminal, "liquidity");
  const terminalRiskSection = readNestedValue(terminal, "risk");
  const terminalSignal = isSubsectionError(terminalSignalSection) ? null : terminalSignalSection;
  const terminalRegime = isSubsectionError(terminalRegimeSection) ? null : terminalRegimeSection;
  const terminalLiquidity = isSubsectionError(terminalLiquiditySection) ? null : terminalLiquiditySection;
  const terminalRisk = isSubsectionError(terminalRiskSection) ? null : terminalRiskSection;
  const spendingSummary = settledValue(results.spendingSummary, "summary");
  const terminalSpending = readNestedValue(terminal, "spending");
  const spending = spendingSummary || (isSubsectionError(terminalSpending) ? null : terminalSpending);

  const nowcast = settledValue(results.nowcast, "nowcast") || readNestedValue(terminal, "nowcast") || null;
  const stressIndex = settledValue(results.stressIndex, "stress_index") || readNestedValue(terminal, "stress_index") || null;
  const capitalFlows = settledValue(results.capitalFlows, "capital_flows") || readNestedValue(terminal, "capital_flows") || null;
  const migrationIndex = settledValue(results.migrationIndex, "migration_index") || readNestedValue(terminal, "migration_index") || null;
  const powerIndex = power?.power_index || readNestedValue(terminal, "power_index") || null;
  const subcontractors = powerIndex?.subcontractors || null;

  const activityTrends = readNestedValue(terminal, "activity_trends") || null;
  const permitsTrend = asNumber(activityTrends?.permits_trend_pct);
  const startsTrend = asNumber(activityTrends?.starts_trend_pct);
  const avgActivityTrend = permitsTrend !== null && startsTrend !== null ? (permitsTrend + startsTrend) / 2 : null;

  const projectPipeline = nowcast?.next_6_months === "softening" || (avgActivityTrend !== null && avgActivityTrend < 0)
    ? "Pipeline bias: cautious"
    : terminalLiquidity?.liquidity_state === "tight"
      ? "Pipeline bias: selective"
      : "Pipeline bias: stable";

  const constructionIndex = asNumber(readNestedValue(terminal, "construction_index"));
  const bidEnvironment = constructionIndex !== null && constructionIndex >= 55
    ? "Competitive"
    : subcontractors?.state === "tight" || nowcast?.next_6_months === "softening"
      ? "Disciplined"
      : "Balanced";

  const migrationUnavailable = !migrationIndex
    || (!Array.isArray(migrationIndex?.inbound_markets) && !Array.isArray(migrationIndex?.outbound_markets))
    || (Array.isArray(migrationIndex?.inbound_markets) && migrationIndex.inbound_markets.length === 0
      && Array.isArray(migrationIndex?.outbound_markets) && migrationIndex.outbound_markets.length === 0);

  const forecastSummary = readNestedValue(terminal, "forecast_summary") || null;
  const heatmapSummary = readNestedValue(terminal, "heatmap_summary") || null;
  const forecastHeadline = forecastSummary?.headline;
  const heatmapTheme = heatmapSummary?.top_strength_theme;
  const heatmapWeaknessTheme = heatmapSummary?.top_weakness_theme;
  const migrationSummary = readNestedValue(terminal, "migration_summary");

  return {
    terminal,
    tape: marketTape,
    signal: asText(terminalSignal?.signal, "unknown"),
    regime: asText(terminalRegime?.regime, "unknown"),
    liquidity: asText(terminalLiquidity?.liquidity_state, asText(marketTape?.liquidity, "unknown")),
    risk: asText(terminalRisk?.risk_level, asText(marketTape?.risk, "unknown")),
    constructionIndex,
    formattedConstructionIndex: formatOneDecimal(constructionIndex),
    stressIndex,
    formattedStressIndex: formatOneDecimal(stressIndex?.score),
    spending,
    power,
    nowcast,
    heatmap: settledValue(results.heatmap, "heatmap") || null,
    forecast: settledValue(results.forecast, "forecast") || null,
    alerts: settledValue(results.alerts, "alerts") || readNestedValue(terminal, "alerts") || [],
    recessionProbability: settledValue(results.recessionProbability, "recession_probability") || readNestedValue(terminal, "recession_probability") || null,
    earlyWarning: settledValue(results.earlyWarning, "early_warning") || readNestedValue(terminal, "early_warning") || null,
    capitalFlows,
    migrationIndex,
    projectPipeline,
    bidEnvironment,
    subcontractorCapacity: {
      score: asNumber(subcontractors?.score),
      state: asText(subcontractors?.state, "unknown"),
      explanation: asText(subcontractors?.explanation, ""),
    },
    migrationSummary: migrationUnavailable
      ? asText(migrationSummary, "Migration index unavailable")
      : `${marketFromList(migrationIndex?.inbound_markets)} → ${marketFromList(migrationIndex?.outbound_markets)}`,
    forecastSummary: isUnavailableText(forecastHeadline, "unavailable")
      ? "Forecast unavailable"
      : asText(forecastHeadline, "Forecast unavailable"),
    heatmapSummary: isUnavailableText(heatmapTheme, "unavailable")
      ? "Heatmap unavailable"
      : asText(heatmapTheme, "Heatmap unavailable"),
    heatmapWeaknessSummary: asText(heatmapWeaknessTheme, ""),
    morningBrief: settledValue(results.morningBrief, "brief") || null,
    operatorActions: readNestedValue(terminal, "operator_actions") || null,
    cycleInterpretation: asText(readNestedValue(terminal, "cycle_interpretation"), "Neutral"),
    forecastStrongestMarket: asText(forecastSummary?.strongest_market, marketFromList(settledValue(results.forecast, "forecast")?.strongest_next_12_months)),
    bidEnvironmentHeadline: asText(power?.power_summary?.headline, ""),
    marketTape: marketTape || {
      signal: asText(terminalSignal?.signal, "unknown"),
      regime: asText(terminalRegime?.regime, "unknown"),
      liquidity: asText(terminalLiquidity?.liquidity_state, "unknown"),
      risk: asText(terminalRisk?.risk_level, "unknown"),
      construction_index: formatOneDecimal(constructionIndex),
      stress_index: formatOneDecimal(stressIndex?.score),
      recession_probability: asNumber(nowcast?.next_12_months_recession_probability),
      commercial_pct: asNumber(spending?.commercial?.pct_change_ytd_vs_pytd),
      housing_pct: asNumber(spending?.housing?.pct_change_ytd_vs_pytd),
      top_market: marketFromList(migrationIndex?.inbound_markets),
      weakest_market: marketFromList(migrationIndex?.outbound_markets),
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
  const heatmapSummary = vm.heatmapSummary;
  const forecastHeadline = vm.forecastSummary;
  const stressValue = vm.formattedStressIndex;
  const commercialHousingTakeaway = commercial !== null && housing !== null
    ? commercial >= 0 && housing >= 0
      ? "Both segments are above prior-year pace."
      : commercial < 0 && housing < 0
        ? "Both segments are below prior-year pace."
        : "Segments are diverging; stay selective by market."
    : "Segment data unavailable.";
  const projectPipeline = vm.projectPipeline;
  const bidEnvironment = vm.bidEnvironment;
  const subCapacity = vm.subcontractorCapacity?.state || "unknown";
  const topAlerts = Array.from(new Map((vm.alerts || []).map((a) => [a.headline, a])).values());
  const operatorActions = vm.operatorActions
    ? `GC: ${vm.operatorActions.gc} Sub: ${vm.operatorActions.subcontractor} Dev: ${vm.operatorActions.developer} Lender: ${vm.operatorActions.lender}`
    : "GC: Protect backlog quality. Sub: Maintain pricing discipline. Dev: Stage starts by financing certainty. Lender: Monitor commercial exposures.";

  panelsEl.innerHTML = `
    <section class="row row-top">${card("Cycle Dial", vm.cycleInterpretation)}${card("Signal", vm.signal)}${card("Regime", vm.regime)}${card("Liquidity", vm.liquidity)}${card("Risk", vm.risk)}${card("Construction Index", vm.formattedConstructionIndex)}${card("Stress Index", stressValue, vm.stressIndex?.explanation || "")}</section>
    <section class="row">${card("Commercial vs Housing", `${commercial ?? "n/a"} / ${housing ?? "n/a"}`, commercialHousingTakeaway)}${card("Power Index", vm.power?.power_summary?.margin_leader || "unknown", powerHeadline)}${card("Forward Outlook", vm.nowcast?.next_6_months || "unknown", `Recession: ${vm.nowcast?.next_12_months_recession_probability ?? "n/a"}%`)}${card("Project Pipeline", projectPipeline, vm.nowcast?.drivers?.[0] || "No driver available")}</section>
    <section class="row">${card("Alerts", topAlerts?.[0]?.headline || "No active alerts", topAlerts?.[0]?.explanation || "")}${card("Heatmap", heatmapSummary, vm.heatmapWeaknessSummary)}${card("Bid Environment", bidEnvironment, vm.bidEnvironmentHeadline)}${card("Subcontractor Capacity", subCapacity, vm.subcontractorCapacity?.explanation || "")}</section>
    <section class="row">${card("Capital Flows", vm.capitalFlows?.headline || "unknown", vm.capitalFlows?.explanation || vm.terminal?.capital_flows_summary || "")}${card("Migration Index", vm.migrationSummary, vm.migrationIndex?.headline || "")}${card("Market Forecast", vm.forecastStrongestMarket, forecastHeadline)}</section>
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
