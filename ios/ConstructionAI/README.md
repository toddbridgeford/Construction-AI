# ConstructionAI iOS Terminal

## Running the app
1. Open `ios/ConstructionAI` in Swift Playgrounds or Xcode.
2. Build and run `ConstructionAIApp`.
3. The app loads `dashboard_latest.json` plus configured `marketSignalFeeds`.

## GitHub token configuration
The app reads token values from UserDefaults, environment, or Info.plist keys:
- `GITHUB_TOKEN`
- `CONSTRUCTION_AI_GITHUB_TOKEN`

The token is only used for authenticated dashboard fetches and is never printed to logs.

## Dashboard + market feeds
- Dashboard endpoint defaults to `Config.dashboardURL`.
- Market feeds default to `Config.marketSignalFeeds`.
- Runtime overrides are available through `RuntimeConfig` UserDefaults keys for testing.

## Diagnostics
Use **Settings → Report Diagnostics** to generate a non-sensitive report and copy it.
Included fields: app version/build, OS, device model, last refresh, endpoint URLs, and source health.

## Build for TestFlight
1. Product → Archive
2. Distribute App → App Store Connect → Upload
3. Validate build in TestFlight, then add release notes.

## Release build checklist
- Confirm version and build number are updated.
- Verify dashboard endpoint and market feed URLs.
- Confirm token state appears as Configured/Not configured (without token value).
- Run offline cache test (disable network after one successful refresh).
- Verify keyboard shortcuts on iPad (`⌘K`, `⌘R`, `⌘1...⌘5`, arrows, Enter, Esc).
- Verify inspector actions (copy/share/pin/watch).
- Generate diagnostics and verify no sensitive data is included.

## Known limitations
- iPhone inspector presentation remains split-view dependent.
- Runtime endpoint overrides are intended for QA only.
