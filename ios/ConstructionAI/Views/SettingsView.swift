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

            Section("Market API Feeds") {
                ForEach(Config.marketSignalFeeds, id: \.name) { feed in
                    LabeledContent(feed.name, value: feed.url.absoluteString)
                        .font(.caption2)
                }
            }

            if !store.sourceHealth.isEmpty {
                Section("Source Health") {
                    ForEach(store.sourceHealth) { source in
                        VStack(alignment: .leading) {
                            Text(source.source)
                            Text(source.detail ?? source.status)
                                .font(.caption)
                                .foregroundStyle(source.status == "error" ? .red : .secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Settings")
    }
}
