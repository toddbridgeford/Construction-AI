import SwiftUI

struct TerminalShellView: View {
    @StateObject private var store = DashboardStore()
    @StateObject private var prefs = TerminalPreferencesStore()
    @State private var selection: WorkspaceDestination? = .overview
    @State private var isPalettePresented = false
    @State private var paletteQuery = ""
    @State private var paletteSelection = PaletteSelectionState()

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                Section("Workspace") {
                    ForEach(WorkspaceDestination.allCases) { destination in
                        NavigationLink(value: destination) {
                            Label(destination.title, systemImage: destination.systemImage)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Workspace")
        } content: {
            ZStack {
                Color(uiColor: .systemBackground).ignoresSafeArea()
                VStack(spacing: 0) {
                    TerminalTopBarView(searchText: $store.searchText, statusText: store.statusText, lastRefresh: store.lastRefresh)

                    if let errorMessage = store.errorMessage {
                        ErrorBannerView(message: errorMessage) {
                            Task { await store.refreshFromGitHub() }
                        }
                        .padding(.horizontal, TerminalTheme.Spacing.small)
                        .padding(.bottom, TerminalTheme.Spacing.xSmall)
                    }

                    if store.hasNoData {
                        EmptyStateView { Task { await store.refreshFromGitHub() } }
                    } else if store.isLoading && store.payload == nil {
                        LoadingSkeletonView()
                    } else {
                        switch selection ?? .overview {
                        case .signals: SignalsView(store: store)
                        case .regions: RegionsView(store: store)
                        case .briefings: BriefingsView(store: store)
                        case .settings: SettingsView(store: store)
                        case .overview: OverviewView(store: store, prefs: prefs)
                        }
                    }
                }
                if isPalettePresented {
                    CommandPaletteView(
                        isPresented: $isPalettePresented,
                        query: $paletteQuery,
                        results: paletteResults,
                        selectedIndex: paletteSelection.selectedIndex
                    ) { item in
                        executePaletteAction(action: item.action)
                    }
                }
                KeyCommandHostingView { command in
                    handleCommand(command)
                }
                .frame(width: 0, height: 0)
            }
        } detail: {
            InspectorView(signal: store.selectedSignal, alert: store.selectedAlert, generatedAt: store.payload?.generatedAt)
        }
        .task { store.bootstrap() }
    }

    private var paletteItems: [PaletteItem] {
        buildPaletteItems(store: store, prefs: prefs)
    }

    private var paletteResults: PaletteResults {
        PaletteScorer.results(items: paletteItems, query: paletteQuery)
    }

    private func handleCommand(_ command: KeyCommandAction) {
        switch command {
        case .openPalette:
            isPalettePresented = true
            paletteQuery = ""
            paletteSelection = .init()
        case .refresh:
            Task { await store.refreshFromGitHub() }
        case .focusSearch:
            selection = .overview
        case .navigate(let index):
            selection = WorkspaceDestination.commandMap[index] ?? selection
        case .dismiss:
            isPalettePresented = false
        case .up:
            paletteSelection.moveUp(maxCount: paletteResults.flat.count)
        case .down:
            paletteSelection.moveDown(maxCount: paletteResults.flat.count)
        case .execute:
            guard isPalettePresented, paletteResults.flat.indices.contains(paletteSelection.selectedIndex) else { return }
            executePaletteAction(action: paletteResults.flat[paletteSelection.selectedIndex].action)
        }
    }

    private func executePaletteAction(action: PaletteAction) {
        switch action {
        case .navigate(let target):
            selection = WorkspaceDestination(rawValue: target)
        case .refresh:
            Task { await store.refreshFromGitHub() }
        case .clearCache:
            store.clearCache()
        case .copyExecutiveSummary:
            #if canImport(UIKit)
            UIPasteboard.general.string = store.payload?.executiveSummary ?? ""
            #endif
        case .selectSignal(let id):
            store.selectedSignal = store.payload?.signals.first(where: { $0.id == id })
        case .selectAlert(let id):
            store.selectedAlert = store.payload?.alerts.first(where: { $0.id == id })
        case .showRegion(let id):
            selection = .regions
            if let region = store.regions.first(where: { $0.id == id }) {
                AppLogger.ui.info("Region selected from palette: \(region.name)")
            }
        }
        isPalettePresented = false
    }
}

private enum WorkspaceDestination: String, CaseIterable, Identifiable {
    case overview
    case signals
    case regions
    case briefings
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .signals: return "Signals"
        case .regions: return "Regions"
        case .briefings: return "Briefings"
        case .settings: return "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .overview: return "square.grid.3x3"
        case .signals: return "waveform.path.ecg"
        case .regions: return "map"
        case .briefings: return "doc.text"
        case .settings: return "gearshape"
        }
    }

    static let commandMap: [Int: WorkspaceDestination] = [
        1: .overview,
        2: .signals,
        3: .regions,
        4: .briefings,
        5: .settings
    ]
}

private struct ErrorBannerView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(.red)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 4) {
                TerminalSectionHeader(title: "Connection warning")
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            Spacer()
            Button("Retry", action: retry)
                .buttonStyle(TerminalButtonStyle(intent: .destructive))
                .accessibilityHint("Attempts to reconnect and reload dashboard data")
        }
        .padding(10)
        .background(Color.red.opacity(0.1), in: RoundedRectangle(cornerRadius: TerminalTheme.Radius.row))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Connection warning. \(message)")
    }
}

@MainActor
func buildPaletteItems(store: DashboardStore, prefs: TerminalPreferencesStore) -> [PaletteItem] {
    var items: [PaletteItem] = [
        PaletteItem(id: "nav:overview", category: .navigate, title: "Go to Overview", subtitle: "Dashboard grid", symbol: "square.grid.3x3", hint: "⌘1", hintStyle: .jump, keywords: ["home", "dashboard"], priority: 900, action: .navigate("overview")),
        PaletteItem(id: "nav:signals", category: .navigate, title: "Go to Signals", subtitle: "Signal stream", symbol: "waveform.path.ecg", hint: "⌘2", hintStyle: .jump, keywords: ["signals", "feed"], priority: 880, action: .navigate("signals")),
        PaletteItem(id: "nav:regions", category: .navigate, title: "Go to Regions", subtitle: "Regional pressure", symbol: "map", hint: "⌘3", hintStyle: .jump, keywords: ["regions", "market"], priority: 860, action: .navigate("regions")),
        PaletteItem(id: "nav:briefings", category: .navigate, title: "Go to Briefings", subtitle: "Executive notes", symbol: "doc.text", hint: "⌘4", hintStyle: .jump, keywords: ["briefing"], priority: 840, action: .navigate("briefings")),
        PaletteItem(id: "nav:settings", category: .navigate, title: "Go to Settings", subtitle: "Configuration and diagnostics", symbol: "gearshape", hint: "⌘5", hintStyle: .jump, keywords: ["settings", "diagnostics"], priority: 820, action: .navigate("settings")),
        PaletteItem(id: "act:refresh", category: .actions, title: "Refresh dashboard", subtitle: "Fetch newest snapshot", symbol: "arrow.clockwise", hint: "⌘R", hintStyle: .command, keywords: ["reload", "sync"], priority: 950, action: .refresh),
        PaletteItem(id: "act:clear-cache", category: .actions, title: "Clear cache", subtitle: "Remove offline snapshot", symbol: "trash", hint: "Action", hintStyle: .action, keywords: ["offline", "disk"], priority: 940, action: .clearCache),
        PaletteItem(id: "act:copy-summary", category: .actions, title: "Copy executive summary", subtitle: "Send summary to clipboard", symbol: "doc.on.doc", hint: "Action", hintStyle: .action, keywords: ["copy"], priority: 930, action: .copyExecutiveSummary)
    ]

    items += store.payload?.signals.enumerated().map { idx, signal in
        PaletteItem(id: "sig:\(signal.id)", category: .signals, title: signal.key, subtitle: signal.interpretation ?? "Signal detail", symbol: "chart.line.uptrend.xyaxis", hint: prefs.pinnedSignalIDs.contains(signal.id) ? "Pinned" : "Signal", hintStyle: .action, keywords: [signal.severity.rawValue], priority: 700 - idx, action: .selectSignal(signal.id))
    } ?? []

    items += store.payload?.alerts.enumerated().map { idx, alert in
        let severityPriority: Int
        switch alert.severity {
        case .critical: severityPriority = 760
        case .watch: severityPriority = 740
        case .monitor: severityPriority = 720
        case .normal, .unknown: severityPriority = 700
        }
        return PaletteItem(id: "alrt:\(alert.id)", category: .alerts, title: alert.title, subtitle: alert.message, symbol: "exclamationmark.triangle", hint: alert.severity.rawValue, hintStyle: .action, keywords: [alert.severity.rawValue], priority: severityPriority - idx, action: .selectAlert(alert.id))
    } ?? []

    items += store.regions.enumerated().map { idx, region in
        PaletteItem(id: "reg:\(region.id)", category: .regions, title: region.name, subtitle: region.summary ?? "Regional snapshot", symbol: "globe.americas", hint: "Region", hintStyle: .jump, keywords: ["pressure"], priority: 620 - idx, action: .showRegion(region.id))
    }

    return items
}
