import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const projectsRoot = path.join(repoRoot, 'dist', 'projects');
const artifactsRoot = path.join(repoRoot, 'dist', 'artifacts');

const STAGE_WINDOWS = {
  planning: 180,
  design: 120,
  permitting: 90,
  pre_bid: 45,
  bidding: 21,
  awarded: 7,
  construction: 0,
  complete: 0
};

function toDate(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function estimateBidWindow(project, generatedDate) {
  const procurement = project.procurement ?? {};
  const explicitBidDate = toDate(procurement.bid_date);
  const rfqDate = toDate(procurement.rfq_release_date);
  const permitDate = toDate(procurement.permit_submission_date);

  if (explicitBidDate) {
    const windowDays = Number.isInteger(procurement.bid_window_days) ? procurement.bid_window_days : 21;
    return {
      estimated_bid_date: isoDate(explicitBidDate),
      bid_window_days: windowDays,
      confidence: 'high',
      notes: 'Derived from explicit procurement.bid_date.'
    };
  }

  if (rfqDate) {
    return {
      estimated_bid_date: isoDate(addDays(rfqDate, 21)),
      bid_window_days: 21,
      confidence: 'medium',
      notes: 'Derived from rfq_release_date + deterministic 21-day window.'
    };
  }

  if (permitDate) {
    return {
      estimated_bid_date: isoDate(addDays(permitDate, 30)),
      bid_window_days: 30,
      confidence: 'medium',
      notes: 'Derived from permit_submission_date + deterministic 30-day window.'
    };
  }

  const stageWindow = STAGE_WINDOWS[project.stage];
  if (typeof stageWindow === 'number' && stageWindow > 0) {
    return {
      estimated_bid_date: isoDate(addDays(generatedDate, stageWindow)),
      bid_window_days: stageWindow,
      confidence: 'low',
      notes: `Derived from stage-based heuristic (${project.stage}).`
    };
  }

  return {
    estimated_bid_date: null,
    bid_window_days: null,
    confidence: 'low',
    notes: 'Insufficient procurement evidence for bid-date estimate.'
  };
}

function contactConfidence(contact) {
  const hasDirect = Boolean(contact.email) || Boolean(contact.phone);
  const hasCompany = Boolean(contact.company);
  if (hasDirect && hasCompany) return 'high';
  if (hasDirect || hasCompany) return 'medium';
  return 'low';
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function buildForMarket(marketDirName) {
  const inputFile = path.join(projectsRoot, marketDirName, 'projects_latest.json');
  const payload = await readJson(inputFile);
  const generatedAt = payload.generated_at || new Date().toISOString();
  const generatedDate = new Date(generatedAt);

  const bidCalendar = {
    version: payload.version || '1.0.0',
    market: payload.market || marketDirName,
    generated_at: generatedAt,
    artifact_type: 'bid_calendar',
    source: {
      input_file: path.relative(repoRoot, inputFile),
      project_count: Array.isArray(payload.projects) ? payload.projects.length : 0
    },
    records: []
  };

  const contacts = {
    version: payload.version || '1.0.0',
    market: payload.market || marketDirName,
    generated_at: generatedAt,
    artifact_type: 'contacts',
    source: {
      input_file: path.relative(repoRoot, inputFile),
      project_count: Array.isArray(payload.projects) ? payload.projects.length : 0
    },
    records: []
  };

  for (const project of payload.projects || []) {
    const estimate = estimateBidWindow(project, generatedDate);
    bidCalendar.records.push({
      project_id: project.project_id,
      project_name: project.name,
      stage: project.stage,
      estimated_bid_date: estimate.estimated_bid_date,
      bid_window_days: estimate.bid_window_days,
      confidence: estimate.confidence,
      notes: estimate.notes
    });

    for (const contact of project.contacts || []) {
      contacts.records.push({
        project_id: project.project_id,
        project_name: project.name,
        contact_name: contact.name,
        contact_role: contact.role,
        company: contact.company || null,
        email: contact.email || null,
        phone: contact.phone || null,
        confidence: contactConfidence(contact)
      });
    }
  }

  bidCalendar.records.sort((a, b) => {
    if (a.estimated_bid_date === b.estimated_bid_date) {
      return a.project_id.localeCompare(b.project_id);
    }
    if (a.estimated_bid_date === null) return 1;
    if (b.estimated_bid_date === null) return -1;
    return a.estimated_bid_date.localeCompare(b.estimated_bid_date);
  });

  contacts.records.sort((a, b) => {
    const projectCompare = a.project_id.localeCompare(b.project_id);
    if (projectCompare !== 0) return projectCompare;
    return a.contact_name.localeCompare(b.contact_name);
  });

  const marketArtifactsDir = path.join(artifactsRoot, marketDirName);
  await writeJson(path.join(marketArtifactsDir, 'bid_calendar_latest.json'), bidCalendar);
  await writeJson(path.join(marketArtifactsDir, 'contacts_latest.json'), contacts);
}

async function main() {
  let markets = [];
  try {
    const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
    markets = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return;
  }

  for (const market of markets) {
    const candidate = path.join(projectsRoot, market, 'projects_latest.json');
    try {
      await fs.access(candidate);
    } catch {
      continue;
    }
    await buildForMarket(market);
  }
}

await main();
