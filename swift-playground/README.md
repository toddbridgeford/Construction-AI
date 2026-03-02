# Swift Playground Assets

This folder now includes two Swift Playground-compatible assets:

- `ConstructionDashboardBuilder.swift`: data-pipeline script that generates dashboard JSON.
- `ConstructionOpsPlaygroundApp.swift`: full SwiftUI iPad app for operational monitoring with ChatGPT + Notion + GitHub integrations.

## `ConstructionOpsPlaygroundApp.swift` highlights

- SwiftUI-only, dependency-free architecture suitable for iPad Swift Playgrounds.
- Configurable GitHub Actions workflow polling (owner/repo/workflow file/token).
- Configurable Notion database query integration (database ID/token).
- Configurable OpenAI chat completion call for status summaries.
- Defensive decoding and failure-safe network handling.
- Local caching via `UserDefaults` so failed refreshes do not block the UI.
- Event log + status banner feedback for actionable errors.

## Running on iPad Swift Playgrounds

1. Create a new **App** playground in Swift Playgrounds.
2. Replace its default source with `ConstructionOpsPlaygroundApp.swift`.
3. Run the app once, then open **Connections** and fill credentials.
4. Tap:
   - **Refresh GitHub**
   - **Refresh Notion**
   - **Generate Summary**

If APIs fail, the app displays warning banners and keeps the latest cached data visible.

## `ConstructionDashboardBuilder.swift`

This standalone script rewrites the JavaScript dashboard generator and can still be run with:

```bash
swift swift-playground/ConstructionDashboardBuilder.swift
```
