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
            ZStack {
                LinearGradient(colors: [Color.black, Color(red: 0.08, green: 0.09, blue: 0.12)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    TerminalTopBarView(searchText: $store.searchText, statusText: store.statusText, lastRefresh: store.lastRefresh)

                    if let errorMessage = store.errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.white)
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.7))
                            .padding(.horizontal, 8)
                            .padding(.bottom, 4)
                    }

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
            }
        } detail: {
            InspectorView(signal: store.selectedSignal, alert: store.selectedAlert, generatedAt: store.payload?.generatedAt)
        }
        .preferredColorScheme(.dark)
        .task { store.bootstrap() }
    }
}
