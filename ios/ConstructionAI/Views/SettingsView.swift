import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: DashboardStore
    @State private var diagnosticsText = ""

    var body: some View {
        Form {
            Section("Data") {
                LabeledContent("Dashboard URL", value: RuntimeConfig.dashboardURL.absoluteString)
                LabeledContent("Last refresh", value: store.lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")
                LabeledContent("GitHub API Token", value: Config.isGitHubTokenConfigured ? "Configured" : "Not configured")
                Button("Clear Cache") { store.clearCache() }
                    .buttonStyle(TerminalButtonStyle(intent: .destructive))
                    .accessibilityHint("Removes local cached dashboard data")
                Button("Retry Fetch") { Task { await store.refreshFromGitHub() } }
                    .buttonStyle(TerminalButtonStyle(intent: .primary))
                    .accessibilityHint("Attempts to reload data from APIs")
            }

            Section("Market API Feeds") {
                ForEach(RuntimeConfig.marketSignalFeeds, id: \.name) { feed in
                    LabeledContent(feed.name, value: feed.url.absoluteString)
                        .font(.caption2)
                }
            }

            Section("Diagnostics") {
                Button("Report Diagnostics") {
                    diagnosticsText = buildDiagnostics()
                }
                if !diagnosticsText.isEmpty {
                    Text(diagnosticsText)
                        .font(.caption)
                        .textSelection(.enabled)
                    Button("Copy Diagnostics") {
                        #if canImport(UIKit)
                        UIPasteboard.general.string = diagnosticsText
                        #endif
                    }
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

    private func buildDiagnostics() -> String {
        let device: String
        #if canImport(UIKit)
        device = UIDevice.current.model
        #else
        device = "Apple Device"
        #endif
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"
        let feeds = RuntimeConfig.marketSignalFeeds.map { "- \($0.name): \($0.url.absoluteString)" }.joined(separator: "\n")
        let source = store.sourceHealth.map { "- \($0.source): \($0.status)" }.joined(separator: "\n")
        return """
        ConstructionAI Diagnostics
        Version: \(version) (\(build))
        iOS: \(ProcessInfo.processInfo.operatingSystemVersionString)
        Device: \(device)
        Last Refresh: \(store.lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")
        Dashboard URL: \(RuntimeConfig.dashboardURL.absoluteString)
        Market feeds:
        \(feeds)
        Source health:
        \(source)
        """
    }
}
