import SwiftUI

struct TerminalShellView: View {
    @StateObject private var store = DashboardStore()
    @StateObject private var prefs = TerminalPreferencesStore()
    @State private var selection: String? = "overview"

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                NavigationLink("Overview", value: "overview")
                NavigationLink("Signals", value: "signals")
                NavigationLink("Regions", value: "regions")
                NavigationLink("Briefings", value: "briefings")
                NavigationLink("Settings", value: "settings")
            }
            .navigationTitle("Workspace")
        } content: {
            VStack(spacing: 0) {
                TerminalTopBarView(searchText: $store.searchText, statusText: store.statusText, lastRefresh: store.lastRefresh)

                if store.hasNoData {
                    EmptyStateView { Task { await store.refreshFromGitHub() } }
                } else if store.isLoading && store.payload == nil {
                    LoadingSkeletonView()
                } else {
                    switch selection {
                    case "signals":
                        SignalsView(store: store)
                    case "regions":
                        RegionsView(store: store)
                    case "briefings":
                        BriefingsView(store: store)
                    case "settings":
                        SettingsView(store: store)
                    default:
                        OverviewView(store: store, prefs: prefs)
                    }
                }
            }
        } detail: {
            InspectorView(signal: store.selectedSignal, alert: store.selectedAlert, generatedAt: store.payload?.generatedAt)
        }
        .task { store.bootstrap() }
    }
}
