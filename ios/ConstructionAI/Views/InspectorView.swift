import SwiftUI

struct InspectorView: View {
    let signal: SignalItem?
    let alert: AlertItem?
    let generatedAt: String?
    @State private var isPinned = false
    @State private var isWatched = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let signal {
                    InspectorHeaderView(title: signal.key, severity: signal.severity, lastUpdated: DateFormatting.display(generatedAt))

                    VStack(alignment: .leading, spacing: 8) {
                        TerminalSectionHeader(title: "What changed")
                        HStack {
                            Image(systemName: Trend.from(arrow: signal.arrow).symbol)
                            Text(signal.value.map { String(format: "%.2f", $0) } ?? "—").font(TerminalTheme.mono(size: 16))
                        }
                    }
                    .terminalPanel()

                    VStack(alignment: .leading, spacing: 8) {
                        TerminalSectionHeader(title: "Why it matters")
                        Text(signal.interpretation ?? "No interpretation provided.")
                    }
                    .terminalPanel()

                    actionButtons(summary: "\(signal.key): \(signal.interpretation ?? "No interpretation")")
                } else if let alert {
                    InspectorHeaderView(title: alert.title, severity: alert.severity, lastUpdated: DateFormatting.display(generatedAt))
                    VStack(alignment: .leading, spacing: 8) {
                        TerminalSectionHeader(title: "Alert details")
                        Text(alert.message)
                    }
                    .terminalPanel()
                    actionButtons(summary: "\(alert.title): \(alert.message)")
                } else {
                    ContentUnavailableView("Select an item", systemImage: "sidebar.right", description: Text("Choose a signal or alert to inspect detailed context."))
                }
            }
            .padding(16)
        }
    }

    private func actionButtons(summary: String) -> some View {
        HStack {
            Button("Copy summary") {
                #if canImport(UIKit)
                UIPasteboard.general.string = summary
                #endif
            }
            .buttonStyle(.bordered)
            .accessibilityHint("Copies summary text to clipboard")

            ShareLink(item: summary) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.bordered)

            Toggle("Pin", isOn: $isPinned).toggleStyle(.button)
            Toggle("Watch", isOn: $isWatched).toggleStyle(.button)
        }
        .controlSize(.large)
        .terminalPanel()
    }
}
