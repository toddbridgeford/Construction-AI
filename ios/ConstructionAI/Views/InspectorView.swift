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
                    let valueText = metricValue(signal.value, precision: 2)
                    InspectorHeaderView(title: signal.key, severity: signal.severity, lastUpdated: DateFormatting.display(generatedAt))

                    VStack(alignment: .leading, spacing: 8) {
                        TerminalSectionHeader(title: "What changed")
                        HStack {
                            Image(systemName: Trend.from(arrow: signal.arrow).symbol)
                                .accessibilityHidden(true)
                            Text(valueText)
                                .font(TerminalTheme.mono(size: 16))
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Value \(valueText)")
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
        ViewThatFits {
            HStack(spacing: TerminalTheme.Spacing.small) {
                copyButton(summary)
                shareButton(summary)
                pinButton
                watchButton
            }

            VStack(alignment: .leading, spacing: TerminalTheme.Spacing.small) {
                copyButton(summary)
                shareButton(summary)
                HStack(spacing: TerminalTheme.Spacing.small) {
                    pinButton
                    watchButton
                }
            }
        }
        .terminalPanel()
    }

    private func copyButton(_ summary: String) -> some View {
        Button("Copy summary") {
            #if canImport(UIKit)
            UIPasteboard.general.string = summary
            #endif
        }
        .buttonStyle(TerminalButtonStyle(intent: .neutral))
        .accessibilityHint("Copies summary text to clipboard")
    }

    private func shareButton(_ summary: String) -> some View {
        ShareLink(item: summary) {
            Label("Share", systemImage: "square.and.arrow.up")
        }
        .buttonStyle(TerminalButtonStyle(intent: .neutral))
    }

    private var pinButton: some View {
        Button(isPinned ? "Pinned" : "Pin") {
            isPinned.toggle()
        }
        .buttonStyle(TerminalButtonStyle(intent: isPinned ? .selected : .neutral))
        .accessibilityHint("Marks this inspector item as pinned in this session")
    }

    private var watchButton: some View {
        Button(isWatched ? "Watching" : "Watch") {
            isWatched.toggle()
        }
        .buttonStyle(TerminalButtonStyle(intent: isWatched ? .primary : .neutral))
        .accessibilityHint("Marks this inspector item as watched in this session")
    }

    private func metricValue(_ value: Double?, precision: Int, fallback: String = "—") -> String {
        guard let value else { return fallback }
        return String(format: "%.*f", precision, value)
    }
}
