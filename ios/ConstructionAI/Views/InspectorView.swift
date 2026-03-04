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
                    HStack {
                        SeverityChipView(severity: signal.severity)
                        Text(DateFormatting.display(generatedAt)).font(.caption).foregroundStyle(.secondary)
                    }

                    Text("What changed").font(.headline)
                    HStack {
                        Image(systemName: Trend.from(arrow: signal.arrow).symbol)
                        Text(signal.value.map { String(format: "%.2f", $0) } ?? "—").font(TerminalTheme.mono(size: 16))
                    }

                    Text("Why it matters").font(.headline)
                    Text(signal.interpretation ?? "No interpretation provided.")

                    actionButtons(summary: "\(signal.key): \(signal.interpretation ?? "No interpretation")")
                } else if let alert {
                    InspectorHeaderView(title: alert.title, severity: alert.severity, lastUpdated: DateFormatting.display(generatedAt))
                    HStack {
                        SeverityChipView(severity: alert.severity)
                        Text(DateFormatting.display(generatedAt)).font(.caption).foregroundStyle(.secondary)
                    }
                    Text(alert.message)
                    actionButtons(summary: "\(alert.title): \(alert.message)")
                } else {
                    Text("Select an item to inspect").foregroundStyle(.secondary)
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
    }
}
