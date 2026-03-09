# PWA Phase 1 Implementation Notes

## Audit summary (before refactor)
- The repository did not contain `dashboard/index2.html`; the existing browser UI entrypoint was `dashboard/index.html`.
- Project inputs, plans, and submit workflow were not first-class concepts in the prior dashboard UI.
- Existing calculations in the UI were pulled from construction endpoints in `dashboard/app.js` (notably `/construction/terminal`, `/construction/power`, and others).
- Existing browser-side persistence for a project workflow model was not implemented.
- Existing shell was a single-page terminal dashboard, not a mobile-first app-shell with bottom tabs.

## Where calculations happen now
- Calculations are triggered by **Submit Project** and refresh actions in `dashboard/app.js`.
- The app calls:
  - `/construction/terminal`
  - `/construction/power`
  - `/construction/forecast`
- The UI combines those responses with saved project inputs and plans into `results` + `calculationSummary`.

## Where plans go now
- Plans are now first-class on the **Plans** tab.
- Uploads are captured as file metadata (name/type/size/modified date).
- References are captured as attached URL/text references.
- Plan entries are stored on each project object in `project.plans`.

## Where project data is stored now
- Project objects are persisted in browser `localStorage`:
  - `construct.workflow.projects.v1`
  - `construct.workflow.activeProjectId.v1`
- Autosave behavior is tied to field changes and plan changes.

## What Submit Project does now
- Validates minimum required fields and plans.
- Sets status to `Submitted` and persists state.
- Runs API-backed calculations.
- Saves results payload + plain-English method.
- Updates status to `Calculated` on success, `Error` on failure.
- Navigates to **Results** tab after successful completion.

## UI changes
- Replaced overloaded terminal-style view with a mobile-first app shell in `dashboard/index2.html`.
- Added four bottom tabs: **Home**, **Projects**, **Plans**, **Results**.
- Added status model: Draft, Missing Plans, Ready, Submitted, Calculated, Error.
- Added a single primary CTA: **Submit Project**.
- Added PWA resources (`manifest.webmanifest`, `service-worker.js`) for installable/offline shell support.
- Removed visible AIQ branding in the new UI shell.

## Ambiguous existing logic preserved during refactor
- API calculation semantics remain server-owned; the UI only aggregates and explains returned values.
- Existing endpoint patterns are preserved (`/construction/terminal`, `/construction/power`, `/construction/forecast`) rather than introducing new backend contracts.
