# Construction AI Dashboard (Mock Frontend)

Institutional-grade **construction intelligence dashboard** built with Next.js App Router, TypeScript, Tailwind CSS, and Recharts.

> This repository currently uses **mock/sample data only** for product and UX development.

## Quick Start

### Prerequisites
- Node.js 18+ (recommended: 20 LTS)
- npm 9+

### Install and run
```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

### Production build check
```bash
npm run build
npm run start
```

### Lint check
```bash
npm run lint
```

---

## Routes

- `/` — Executive Dashboard
- `/segment-monitor` — Segment Monitor
- `/credit-risk` — Credit / Risk View
- `/data-detail` — Data Detail View

---

## Architecture Overview

```text
app/            # App Router pages and root layout
components/     # Reusable UI components (tables, panels, shell, controls)
data/           # Typed mock data for dashboard views
lib/            # Framing helpers and shared utilities
types/          # Domain TypeScript types/interfaces
```

### Audience mode flow (centralized)
- Audience selection state is managed in `components/AppShell.tsx`.
- Shared framing and guardrails are centralized in `lib/audience.ts`:
  - `getAudienceFrame(mode)`
  - `frameWatchlistForAudience(items, mode)`
- Audience content variants are defined in `data/audienceModes.ts`.

This keeps audience behavior easy to extend without touching each page's core layout.

---

## Mock Data Notice

All values and commentary are **sample/mock data** and should not be interpreted as live market data.

See: [`docs/mock-data.md`](docs/mock-data.md)

---

## Reviewer Verification Checklist

Use this quick path after dependencies are available:

1. Run `npm install`
2. Run `npm run build`
3. Run `npm run dev`
4. Validate routes:
   - `/`
   - `/segment-monitor`
   - `/credit-risk`
   - `/data-detail`

### Route-level checklist

#### `/` Executive Dashboard
- [ ] Executive brief band renders (dated title, one-line signal, strategist bullets, bottom-line area)
- [ ] KPI group tables render with readable hierarchy
- [ ] Watchlist labels adapt when audience mode changes

#### `/segment-monitor`
- [ ] Segment comparison table renders required segment rows
- [ ] Trend chart renders without layout overflow
- [ ] Commentary panel remains concise and readable

#### `/credit-risk`
- [ ] Exposure table renders near top
- [ ] Surveillance/watchlist reflects audience framing
- [ ] Single bottom-line panel appears at end

#### `/data-detail`
- [ ] Each metric panel shows latest/prior/MoM/YoY/source/reference period
- [ ] Trend charts render where `trendKey` is present
- [ ] Notes display for revision/lag/seasonality where available

---

## Empty/Error-Safe Posture (Mock Data)

If a section’s mock data is missing, pages render a clear empty-state panel instead of failing silently.

Examples:
- Missing KPI groups or watchlist on `/`
- Missing segment rows or trend series on `/segment-monitor`
- Missing exposures or surveillance items on `/credit-risk`
- Missing detail metrics on `/data-detail`

---

## Scripts

`package.json` scripts are intentionally standard and minimal:
- `dev` — run local development server
- `build` — production build
- `start` — serve production build
- `lint` — run Next.js lint

