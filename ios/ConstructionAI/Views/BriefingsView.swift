import SwiftUI

struct BriefingsView: View {
    @ObservedObject var store: DashboardStore

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
                    Label("Generated \(DateFormatting.shortDateTime.string(from: generatedAt))", systemImage: "clock")
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
