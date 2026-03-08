import SwiftUI
import Foundation

struct BriefingsView: View {
    @ObservedObject var store: DashboardStore

    private static let iso8601WithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let iso8601Standard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private func formattedGeneratedAt(_ value: String) -> String {
        if let date = Self.iso8601WithFractional.date(from: value) ?? Self.iso8601Standard.date(from: value) {
            return DateFormatting.shortDateTime.string(from: date)
        }
        return value
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TerminalTheme.Spacing.medium) {
                TerminalSectionHeader(
                    title: store.payload?.executiveHeadline ?? "Executive Briefing",
                    subtitle: "Condensed strategic narrative for the current market cycle"
                )

                Text(store.payload?.executiveSummary ?? "No summary available.")
                    .font(.body)
                    .foregroundStyle(.secondary)

                if let generatedAt = store.payload?.generatedAt {
                    Label("Generated \(formattedGeneratedAt(generatedAt))", systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(TerminalTheme.Spacing.medium)
            .terminalPanel()
            .padding(TerminalTheme.Spacing.medium)
        }
        .navigationTitle("Briefings")
    }
}
