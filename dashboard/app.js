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
  materialsShock: `${API_BASE}/construction/materials-shock`,
  laborShock: `${API_BASE}/construction/labor-shock`,
  marginPressure: `${API_BASE}/construction/margin-pressure`,
  bidIntensity: `${API_BASE}/construction/bid-intensity`,
  backlogQuality: `${API_BASE}/construction/backlog-quality`,
  projectRisk: `${API_BASE}/construction/project-risk`,
  receivablesRisk: `${API_BASE}/construction/receivables-risk`,
  paymentDelayRisk: `${API_BASE}/construction/payment-delay-risk`,
  collectionsStress: `${API_BASE}/construction/collections-stress`,
  ownerRisk: `${API_BASE}/construction/owner-risk`,
  developerFragility: `${API_BASE}/construction/developer-fragility`,
  lenderPullbackRisk: `${API_BASE}/construction/lender-pullback-risk`,
  counterpartyQuality: `${API_BASE}/construction/counterparty-quality`,
  metroConcentrationRisk: `${API_BASE}/construction/metro-concentration-risk`,
  counterpartyConcentrationRisk: `${API_BASE}/construction/counterparty-concentration-risk`,
  projectMixExposure: `${API_BASE}/construction/project-mix-exposure`,
  portfolioRisk: `${API_BASE}/construction/portfolio-risk`,
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

  const nowcast = settledValue(results.nowcast, "nowcast") || terminal.nowcast || null;
  const stressIndex = settledValue(results.stressIndex, "stress_index") || terminal.stress_index || null;
  const capitalFlows = settledValue(results.capitalFlows, "capital_flows") || terminal.capital_flows || null;
  const migrationIndex = settledValue(results.migrationIndex, "migration_index") || terminal.migration_index || null;
  const materialsShock = settledValue(results.materialsShock, "materials_shock") || terminal.materials_shock || null;
  const laborShock = settledValue(results.laborShock, "labor_shock") || terminal.labor_shock || null;
  const marginPressure = settledValue(results.marginPressure, "margin_pressure") || terminal.margin_pressure || null;
  const bidIntensity = settledValue(results.bidIntensity, "bid_intensity") || terminal.bid_intensity || null;
  const backlogQuality = settledValue(results.backlogQuality, "backlog_quality") || terminal.backlog_quality || null;
  const projectRisk = settledValue(results.projectRisk, "project_risk") || terminal.project_risk || null;
  const receivablesRisk = settledValue(results.receivablesRisk, "receivables_risk") || terminal.receivables_risk || null;
  const paymentDelayRisk = settledValue(results.paymentDelayRisk, "payment_delay_risk") || terminal.payment_delay_risk || null;
  const collectionsStress = settledValue(results.collectionsStress, "collections_stress") || terminal.collections_stress || null;
  const ownerRisk = settledValue(results.ownerRisk, "owner_risk") || terminal.owner_risk || null;
  const developerFragility = settledValue(results.developerFragility, "developer_fragility") || terminal.developer_fragility || null;
  const lenderPullbackRisk = settledValue(results.lenderPullbackRisk, "lender_pullback_risk") || terminal.lender_pullback_risk || null;
  const counterpartyQuality = settledValue(results.counterpartyQuality, "counterparty_quality") || terminal.counterparty_quality || null;
  const metroConcentrationRisk = settledValue(results.metroConcentrationRisk, "metro_concentration_risk") || terminal.metro_concentration_risk || null;
  const counterpartyConcentrationRisk = settledValue(results.counterpartyConcentrationRisk, "counterparty_concentration_risk") || terminal.counterparty_concentration_risk || null;
  const projectMixExposure = settledValue(results.projectMixExposure, "project_mix_exposure") || terminal.project_mix_exposure || null;
  const portfolioRisk = settledValue(results.portfolioRisk, "portfolio_risk") || terminal.portfolio_risk || null;
  const powerIndex = power?.power_index || terminal.power_index || null;
  const subcontractors = powerIndex?.subcontractors || null;

  const permitsTrend = asNumber(terminal.activity_trends?.permits_trend_pct);
  const startsTrend = asNumber(terminal.activity_trends?.starts_trend_pct);
  const avgActivityTrend = permitsTrend !== null && startsTrend !== null ? (permitsTrend + startsTrend) / 2 : null;

  const projectPipeline = nowcast?.next_6_months === "softening" || (avgActivityTrend !== null && avgActivityTrend < 0)
    ? "Pipeline bias: cautious"
    : terminalLiquidity?.liquidity_state === "tight"
      ? "Pipeline bias: selective"
      : "Pipeline bias: stable";

  const bidEnvironment = asNumber(terminal.construction_index) !== null && asNumber(terminal.construction_index) >= 55
    ? "Competitive"
    : subcontractors?.state === "tight" || nowcast?.next_6_months === "softening"
      ? "Disciplined"
      : "Balanced";

  const migrationUnavailable = !migrationIndex
    || (!Array.isArray(migrationIndex?.inbound_markets) && !Array.isArray(migrationIndex?.outbound_markets))
    || (Array.isArray(migrationIndex?.inbound_markets) && migrationIndex.inbound_markets.length === 0
      && Array.isArray(migrationIndex?.outbound_markets) && migrationIndex.outbound_markets.length === 0);

  const forecastHeadline = terminal?.forecast_summary?.headline;
  const heatmapTheme = terminal?.heatmap_summary?.top_strength_theme;

  return {
    terminal,
    tape: marketTape,
    signal: asText(terminalSignal?.signal, "unknown"),
    regime: asText(terminalRegime?.regime, "unknown"),
    liquidity: asText(terminalLiquidity?.liquidity_state, asText(marketTape?.liquidity, "unknown")),
    risk: asText(terminalRisk?.risk_level, asText(marketTape?.risk, "unknown")),
    constructionIndex: asNumber(terminal.construction_index),
    formattedConstructionIndex: formatOneDecimal(terminal.construction_index),
    stressIndex,
    formattedStressIndex: formatOneDecimal(stressIndex?.score),
    spending,
    power,
    nowcast,
    heatmap: settledValue(results.heatmap, "heatmap") || null,
    forecast: settledValue(results.forecast, "forecast") || null,
    alerts: settledValue(results.alerts, "alerts") || terminal.alerts || [],
    recessionProbability: settledValue(results.recessionProbability, "recession_probability") || terminal.recession_probability || null,
    earlyWarning: settledValue(results.earlyWarning, "early_warning") || terminal.early_warning || null,
    capitalFlows,
    materialsShock,
    laborShock,
    marginPressure,
    bidIntensity,
    backlogQuality,
    projectRisk,
    receivablesRisk,
    paymentDelayRisk,
    collectionsStress,
    ownerRisk,
    developerFragility,
    lenderPullbackRisk,
    counterpartyQuality,
    metroConcentrationRisk,
    counterpartyConcentrationRisk,
    projectMixExposure,
    portfolioRisk,
    migrationIndex,
    projectPipeline,
    bidEnvironment,
    subcontractorCapacity: {
      score: asNumber(subcontractors?.score),
      state: asText(subcontractors?.state, "unknown"),
      explanation: asText(subcontractors?.explanation, ""),
    },
    migrationSummary: migrationUnavailable
      ? "Migration index unavailable"
      : `${marketFromList(migrationIndex?.inbound_markets)} → ${marketFromList(migrationIndex?.outbound_markets)}`,
    forecastSummary: isUnavailableText(forecastHeadline, "unavailable")
      ? "Forecast unavailable"
      : asText(forecastHeadline, "Forecast unavailable"),
    heatmapSummary: isUnavailableText(heatmapTheme, "unavailable")
      ? "Heatmap unavailable"
      : asText(heatmapTheme, "Heatmap unavailable"),
    morningBrief: settledValue(results.morningBrief, "brief") || null,
    operatorActions: terminal.operator_actions || null,
    cycleInterpretation: asText(terminal.cycle_interpretation, "Neutral"),
    marketTape: marketTape || {
      signal: asText(terminalSignal?.signal, "unknown"),
      regime: asText(terminalRegime?.regime, "unknown"),
      liquidity: asText(terminalLiquidity?.liquidity_state, "unknown"),
      risk: asText(terminalRisk?.risk_level, "unknown"),
      construction_index: formatOneDecimal(terminal.construction_index),
      stress_index: formatOneDecimal(stressIndex?.score),
      recession_probability: asNumber(nowcast?.next_12_months_recession_probability),
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
    ? `GC: ${vm.operatorActions.gc} Sub: ${vm.operatorActions.subcontractor} Dev: ${vm.operatorActions.developer} Lender: ${vm.operatorActions.lender} Supplier: ${vm.operatorActions.supplier || "Maintain delivery reliability and margin discipline."}`
    : "GC: Protect backlog quality. Sub: Maintain pricing discipline. Dev: Stage starts by financing certainty. Lender: Monitor commercial exposures. Supplier: Maintain delivery reliability and margin discipline.";

  panelsEl.innerHTML = `
    <section class="row row-top">${card("Cycle Dial", vm.cycleInterpretation)}${card("Signal", vm.signal)}${card("Regime", vm.regime)}${card("Liquidity", vm.liquidity)}${card("Risk", vm.risk)}${card("Construction Index", vm.formattedConstructionIndex)}${card("Stress Index", stressValue, vm.stressIndex?.explanation || "")}</section>
    <section class="row">${card("Commercial vs Housing", `${commercial ?? "n/a"} / ${housing ?? "n/a"}`, commercialHousingTakeaway)}${card("Power Index", vm.power?.power_summary?.margin_leader || "unknown", powerHeadline)}${card("Forward Outlook", vm.nowcast?.next_6_months || "unknown", `Recession: ${vm.nowcast?.next_12_months_recession_probability ?? "n/a"}%`)}${card("Project Pipeline", projectPipeline, vm.nowcast?.drivers?.[0] || "No driver available")}</section>
    <section class="row">${card("Alerts", topAlerts?.[0]?.headline || "No active alerts", topAlerts?.[0]?.explanation || "")}${card("Heatmap", heatmapSummary, asText(vm.terminal?.heatmap_summary?.top_weakness_theme, ""))}${card("Bid Environment", bidEnvironment, vm.terminal?.power_summary?.headline || "")}${card("Subcontractor Capacity", subCapacity, vm.subcontractorCapacity?.explanation || "")}</section>
    <section class="row">${card("Capital Flows", vm.capitalFlows?.headline || "unknown", vm.capitalFlows?.explanation || vm.terminal?.capital_flows_summary || "")}${card("Migration Index", vm.migrationSummary, vm.migrationIndex?.headline || vm.terminal?.migration_summary || "")}${card("Market Forecast", asText(vm.terminal?.forecast_summary?.strongest_market, marketFromList(vm.forecast?.strongest_next_12_months)), forecastHeadline)}</section>
    <section class="row">${card("Materials Shock", formatOneDecimal(vm.materialsShock?.score), vm.materialsShock?.explanation || vm.terminal?.materials_shock_summary || "")}${card("Labor Shock", formatOneDecimal(vm.laborShock?.score), vm.laborShock?.explanation || vm.terminal?.labor_shock_summary || "")}${card("Margin Pressure", formatOneDecimal(vm.marginPressure?.score), vm.marginPressure?.explanation || vm.terminal?.margin_pressure_summary || "")}</section>
    <section class="row">${card("Bid Activity / Intensity", formatOneDecimal(vm.bidIntensity?.score), vm.bidIntensity?.explanation || vm.terminal?.bid_intensity_summary || "")}${card("Backlog Quality", formatOneDecimal(vm.backlogQuality?.score), vm.backlogQuality?.explanation || vm.terminal?.backlog_quality_summary || "")}${card("Project Risk", formatOneDecimal(vm.projectRisk?.score), vm.projectRisk?.explanation || vm.terminal?.project_risk_summary || "")}</section>
    <section class="row">${card("Receivables Risk", formatOneDecimal(vm.receivablesRisk?.score), vm.receivablesRisk?.explanation || vm.terminal?.receivables_risk_summary || "")}${card("Payment Delay Risk", formatOneDecimal(vm.paymentDelayRisk?.score), vm.paymentDelayRisk?.explanation || vm.terminal?.payment_delay_risk_summary || "")}${card("Collections Stress", formatOneDecimal(vm.collectionsStress?.score), vm.collectionsStress?.explanation || vm.terminal?.collections_stress_summary || "")}</section>
    <section class="row">${card("Owner Risk", formatOneDecimal(vm.ownerRisk?.score), vm.ownerRisk?.explanation || vm.terminal?.owner_risk_summary || "")}${card("Developer Fragility", formatOneDecimal(vm.developerFragility?.score), vm.developerFragility?.explanation || vm.terminal?.developer_fragility_summary || "")}${card("Lender Pullback Risk", formatOneDecimal(vm.lenderPullbackRisk?.score), vm.lenderPullbackRisk?.explanation || vm.terminal?.lender_pullback_risk_summary || "")}${card("Counterparty Quality", formatOneDecimal(vm.counterpartyQuality?.score), vm.counterpartyQuality?.explanation || vm.terminal?.counterparty_quality_summary || "")}</section>
    <section class="row">${card("Metro Concentration Risk", formatOneDecimal(vm.metroConcentrationRisk?.score), vm.metroConcentrationRisk?.explanation || vm.terminal?.metro_concentration_risk_summary || "")}${card("Counterparty Concentration Risk", formatOneDecimal(vm.counterpartyConcentrationRisk?.score), vm.counterpartyConcentrationRisk?.explanation || vm.terminal?.counterparty_concentration_risk_summary || "")}${card("Project Mix Exposure", formatOneDecimal(vm.projectMixExposure?.score), vm.projectMixExposure?.explanation || vm.terminal?.project_mix_exposure_summary || "")}${card("Portfolio Risk", formatOneDecimal(vm.portfolioRisk?.score), vm.portfolioRisk?.explanation || vm.terminal?.portfolio_risk_summary || "")}</section>
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
