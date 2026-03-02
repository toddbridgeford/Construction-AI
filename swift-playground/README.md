# Swift Playground Rewrite

This folder contains a Swift Playground-compatible rewrite of the repository's JavaScript dashboard generator (`scripts/build_dashboard_latest.mjs`).

## File

- `ConstructionDashboardBuilder.swift`: standalone script you can run in **Swift Playground** or with the Swift CLI.

## What this rewrite does

- Re-implements shared utility functions (`safeNumber`, trend arrows, URL normalization, date helpers).
- Adds a safe FRED fetch pipeline that does not crash the entire run when one series fails.
- Loads repository JSON configuration files from `config/`.
- Produces `dashboard_latest_swift.json` by default.

## Run in Swift Playground

1. Open `ConstructionDashboardBuilder.swift` in Swift Playground.
2. Set environment variables if needed:
   - `FRED_API_KEY` (optional unless using `FRED_SERIES_IDS`)
   - `FRED_SERIES_IDS` (comma-separated, optional)
   - `OUT_PATH` (optional output path)
3. Run the file.

## Run from command line

```bash
swift swift-playground/ConstructionDashboardBuilder.swift
```

With FRED series:

```bash
FRED_API_KEY=your_key FRED_SERIES_IDS=CPIAUCSL,UNRATE swift swift-playground/ConstructionDashboardBuilder.swift
```
