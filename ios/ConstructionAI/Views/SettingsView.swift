import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        Form {
            Section("Data") {
                LabeledContent("Dashboard URL", value: Config.dashboardURL.absoluteString)
                LabeledContent("Last refresh", value: store.lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")
                LabeledContent("GitHub API Token", value: Config.isGitHubTokenConfigured ? "Configured" : "Not configured")
                Button("Clear Cache") { store.clearCache() }
                Button("Retry Fetch") { Task { await store.refreshFromGitHub() } }
            }

            if !(store.payload?.sources.isEmpty ?? true) {
                Section("Source Health") {
                    ForEach(store.payload?.sources ?? []) { source in
                        VStack(alignment: .leading) {
                            Text(source.source)
                            Text(source.detail ?? source.status)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Settings")
    }
}
