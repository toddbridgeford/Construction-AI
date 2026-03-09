const API_BASE = window.DASHBOARD_API_BASE || "";
const STORAGE_KEY = "construct.workflow.projects.v1";
const ACTIVE_PROJECT_KEY = "construct.workflow.activeProjectId.v1";

const ENDPOINTS = {
  terminal: `${API_BASE}/construction/terminal`,
  power: `${API_BASE}/construction/power`,
  forecast: `${API_BASE}/construction/forecast`,
};

const STATUS = {
  DRAFT: "Draft",
  MISSING_PLANS: "Missing Plans",
  READY: "Ready",
  SUBMITTED: "Submitted",
  CALCULATED: "Calculated",
  ERROR: "Error",
};

const state = {
  projects: loadProjects(),
  activeProjectId: localStorage.getItem(ACTIVE_PROJECT_KEY),
  activeTab: "home",
  statusMessage: "",
  loading: false,
};

const tabContentEl = document.getElementById("tabContent");
const refreshBtn = document.getElementById("refreshBtn");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));

if (!("serviceWorker" in navigator)) {
  setStatus("PWA limited: service worker not supported in this browser.");
} else {
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    setStatus(`PWA setup warning: ${error.message}`);
  });
}

if (!state.activeProjectId && state.projects.length) {
  state.activeProjectId = state.projects[0].id;
}

if (!state.projects.length) {
  const starter = createProject({ projectName: "New Project" });
  state.projects.push(starter);
  setActiveProject(starter.id);
}

render();

refreshBtn.addEventListener("click", async () => {
  const project = getActiveProject();
  if (!project) return;
  await runCalculation(project, { fromSubmit: false });
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches(".tab-btn")) {
    state.activeTab = target.dataset.tab || "home";
    render();
  }

  if (target.id === "createProjectBtn") {
    const project = createProject({ projectName: `Project ${state.projects.length + 1}` });
    state.projects.unshift(project);
    setActiveProject(project.id);
    setStatus("New draft project created.");
    saveState();
    render();
  }

  if (target.matches("[data-project-id]")) {
    setActiveProject(target.dataset.projectId);
    setStatus("Project loaded.");
    render();
  }

  if (target.id === "addPlanRefBtn") {
    const project = getActiveProject();
    const input = document.getElementById("planRefInput");
    if (!project || !(input instanceof HTMLInputElement)) return;
    const ref = input.value.trim();
    if (!ref) return;
    project.plans.push({
      id: crypto.randomUUID(),
      type: "reference",
      name: ref,
      source: ref,
      addedAt: new Date().toISOString(),
      status: "attached",
    });
    input.value = "";
    touchProject(project);
    autoUpdateStatus(project);
    saveState();
    setStatus("Plan reference attached.");
    render();
  }

  if (target.id === "submitProjectBtn") {
    const project = getActiveProject();
    if (!project) return;
    await submitProject(project);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const project = getActiveProject();
  if (!project) return;

  if (target.id === "projectName" && target instanceof HTMLInputElement) {
    project.projectName = target.value;
  }

  if (target.id === "projectLocation" && target instanceof HTMLInputElement) {
    project.metadata.location = target.value;
  }

  if (target.id === "projectType" && target instanceof HTMLSelectElement) {
    project.metadata.projectType = target.value;
  }

  if (target.id === "inputArea" && target instanceof HTMLInputElement) {
    project.inputs.estimatedAreaSqFt = Number(target.value || 0);
  }

  if (target.id === "inputBudget" && target instanceof HTMLInputElement) {
    project.inputs.targetBudget = Number(target.value || 0);
  }

  if (target.id === "assumptions" && target instanceof HTMLTextAreaElement) {
    project.assumptions.notes = target.value;
  }

  if (target.id === "planFileInput" && target instanceof HTMLInputElement) {
    const files = Array.from(target.files || []);
    files.forEach((file) => {
      project.plans.push({
        id: crypto.randomUUID(),
        type: "upload",
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        lastModified: file.lastModified,
        addedAt: new Date().toISOString(),
        status: "uploaded",
      });
    });
    target.value = "";
  }

  touchProject(project);
  autoUpdateStatus(project);
  saveState();
  render();
});

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
  if (state.activeProjectId) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, state.activeProjectId);
  }
}

function setStatus(message) {
  state.statusMessage = message;
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

function setActiveProject(projectId) {
  state.activeProjectId = projectId;
  saveState();
}

function createProject(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: STATUS.DRAFT,
    projectName: "",
    metadata: { location: "", projectType: "commercial" },
    plans: [],
    inputs: { estimatedAreaSqFt: 0, targetBudget: 0 },
    assumptions: { notes: "" },
    results: {},
    calculationSummary: {},
    storageInfo: {
      plansStorage: "Browser local storage metadata only",
      projectStorage: "Browser local storage",
    },
    schemaVersion: 1,
    ...overrides,
  };
}

function touchProject(project) {
  project.updatedAt = new Date().toISOString();
}

function isProjectValid(project) {
  const hasName = Boolean(project.projectName?.trim());
  const hasArea = Number(project.inputs.estimatedAreaSqFt) > 0;
  const hasPlan = project.plans.length > 0;
  return hasName && hasArea && hasPlan;
}

function autoUpdateStatus(project) {
  if (project.status === STATUS.SUBMITTED) return;
  if (!project.projectName?.trim() || Number(project.inputs.estimatedAreaSqFt) <= 0) {
    project.status = STATUS.DRAFT;
    return;
  }
  project.status = project.plans.length ? STATUS.READY : STATUS.MISSING_PLANS;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function submitProject(project) {
  if (!isProjectValid(project)) {
    setStatus("Submit Project is disabled until required fields and plans are complete.");
    render();
    return;
  }

  state.loading = true;
  project.status = STATUS.SUBMITTED;
  touchProject(project);
  saveState();
  render();

  await runCalculation(project, { fromSubmit: true });
}

async function runCalculation(project, { fromSubmit }) {
  try {
    setStatus(fromSubmit ? "Submitting project and running calculations..." : "Refreshing calculations...");
    render();

    const [terminalData, powerData, forecastData] = await Promise.all([
      fetchJson(ENDPOINTS.terminal),
      fetchJson(ENDPOINTS.power),
      fetchJson(ENDPOINTS.forecast),
    ]);

    const powerIndex = powerData?.power_index ?? terminalData?.terminal?.power_index ?? null;
    const regime = terminalData?.terminal?.regime?.regime ?? "Unknown";
    const forecastHeadline = forecastData?.forecast?.headline ?? "No forecast headline returned";

    project.results = {
      powerIndex,
      regime,
      forecastHeadline,
      includedPlans: project.plans.map((plan) => ({ name: plan.name, type: plan.type })),
      usedInputs: {
        estimatedAreaSqFt: project.inputs.estimatedAreaSqFt,
        targetBudget: project.inputs.targetBudget,
      },
      assumptions: project.assumptions,
      calculatedAt: new Date().toISOString(),
    };

    project.calculationSummary = {
      method:
        "The app fetches terminal, power, and forecast endpoints, then combines market power index, regime, and forecast context with project inputs and attached plans.",
      explanation:
        "Results are deterministic from API responses plus your saved inputs; no hidden transforms are applied in the UI.",
    };

    project.status = STATUS.CALCULATED;
    touchProject(project);
    saveState();

    state.activeTab = "results";
    setStatus(fromSubmit ? "Project submitted successfully." : "Results refreshed.");
  } catch (error) {
    project.status = STATUS.ERROR;
    touchProject(project);
    saveState();
    setStatus(`Calculation failed: ${error.message}`);
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.activeTab);
  });

  const project = getActiveProject();
  const disabledSubmit = !project || !isProjectValid(project) || state.loading;

  const content = {
    home: renderHome(project),
    projects: renderProjects(project),
    plans: renderPlans(project),
    results: renderResults(project),
  };

  tabContentEl.innerHTML = `${content[state.activeTab]}
    <div class="status-banner ${state.loading ? "loading" : ""}">${state.statusMessage || "Ready"}</div>
    <button id="submitProjectBtn" class="primary-cta" ${disabledSubmit ? "disabled" : ""}>${state.loading ? "Submitting..." : "Submit Project"}</button>`;
}

function renderHome(project) {
  if (!project) return card("No project selected", "Create a project to continue.");
  return `
    ${card("Current Project", `<strong>${escapeHtml(project.projectName || "Untitled")}</strong><p>Status: ${project.status}</p>`)}
    ${card("Recent Activity", `<p>Updated: ${new Date(project.updatedAt).toLocaleString()}</p><p>Plans: ${project.plans.length}</p>`)}
    ${card("Continue", `<p>Complete required fields, add plans, then tap Submit Project.</p>`)}
    ${card("Latest Calculation", `<p>${project.results?.forecastHeadline || "No calculation yet."}</p>`)}
  `;
}

function renderProjects(project) {
  return `
    <section class="card-list">
      ${card("Project Draft", `
        <label>Project name<input id="projectName" value="${escapeAttr(project?.projectName || "")}" placeholder="Example: North Yard Renovation" /></label>
        <label>Location<input id="projectLocation" value="${escapeAttr(project?.metadata?.location || "")}" placeholder="City, State" /></label>
        <label>Project type
          <select id="projectType">
            ${["commercial", "residential", "industrial"].map((option) => `<option value="${option}" ${project?.metadata?.projectType === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </label>
        <label>Estimated area (sq ft)<input id="inputArea" type="number" min="0" value="${Number(project?.inputs?.estimatedAreaSqFt || 0)}" /></label>
        <label>Target budget<input id="inputBudget" type="number" min="0" value="${Number(project?.inputs?.targetBudget || 0)}" /></label>
        <label>Assumptions<textarea id="assumptions" placeholder="Known constraints and assumptions">${escapeHtml(project?.assumptions?.notes || "")}</textarea></label>
      `)}
      ${card("Saved Drafts & Submitted", `
        <button id="createProjectBtn" class="ghost-btn" type="button">New Draft</button>
        <div class="project-list">
          ${state.projects
            .map((item) => `<button type="button" class="project-chip ${item.id === state.activeProjectId ? "active" : ""}" data-project-id="${item.id}">${escapeHtml(item.projectName || "Untitled")} · ${item.status}</button>`)
            .join("")}
        </div>
      `)}
    </section>
  `;
}

function renderPlans(project) {
  const readyText = isProjectValid(project)
    ? "Ready to submit."
    : "Not ready: add required project fields and at least one plan.";

  return `
    ${card("Plans", `
      <label>Upload plan files<input id="planFileInput" type="file" multiple /></label>
      <label>Attach plan reference<input id="planRefInput" placeholder="https://... or sheet reference" /></label>
      <button id="addPlanRefBtn" class="ghost-btn" type="button">Attach Reference</button>
      <p class="helper">${readyText}</p>
    `)}
    ${card("Plan Status", `
      <ul class="plan-list">
        ${(project?.plans || []).map((plan) => `<li>${escapeHtml(plan.name)} <span>${plan.status}</span></li>`).join("") || "<li>No plans attached yet.</li>"}
      </ul>
      <p class="helper">Phase 2 ready: sheet metadata, discipline, preview, and grouping can be layered onto each plan record.</p>
    `)}
  `;
}

function renderResults(project) {
  const results = project?.results || {};
  const summary = project?.calculationSummary || {};
  return `
    ${card("Results Summary", `
      <p>Power Index: <strong>${results.powerIndex ?? "n/a"}</strong></p>
      <p>Regime: <strong>${escapeHtml(results.regime || "Unknown")}</strong></p>
      <p>Forecast: ${escapeHtml(results.forecastHeadline || "No results yet")}</p>
      <p>Last Calculated: ${results.calculatedAt ? new Date(results.calculatedAt).toLocaleString() : "Never"}</p>
    `)}
    ${card("Assumptions & Method", `
      <p><strong>Assumptions used:</strong> ${escapeHtml(project?.assumptions?.notes || "None provided")}</p>
      <p><strong>Calculation method:</strong> ${escapeHtml(summary.method || "Submit Project to populate method details.")}</p>
      <p><strong>Explainability:</strong> ${escapeHtml(summary.explanation || "")}</p>
    `)}
    ${card("Storage & Included Plans", `
      <p>Project data store: ${escapeHtml(project?.storageInfo?.projectStorage || "local storage")}</p>
      <p>Plan data store: ${escapeHtml(project?.storageInfo?.plansStorage || "local storage metadata")}</p>
      <ul class="plan-list">${(results.includedPlans || []).map((plan) => `<li>${escapeHtml(plan.name)} (${plan.type})</li>`).join("") || "<li>No plans used yet.</li>"}</ul>
    `)}
  `;
}

function card(title, content) {
  return `<section class="card"><h2>${title}</h2><div>${content}</div></section>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "");
}
