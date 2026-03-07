import SwiftUI

struct TerminalTopBarView: View {
    @Binding var searchText: String
    let statusText: String
    let lastRefresh: Date?

    var body: some View {
        VStack(spacing: TerminalTheme.Spacing.xSmall) {
            headerRow

            TextField("Search alerts, signals, regions", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Search terminal data")
                .accessibilityHint("Filters signals, alerts, and regions")
        }
        .padding(.horizontal, TerminalTheme.Spacing.medium)
        .padding(.vertical, TerminalTheme.Spacing.small)
        .terminalPanel()
        .padding(.horizontal, TerminalTheme.Spacing.small)
        .padding(.top, TerminalTheme.Spacing.small)
    }

    private var headerRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: TerminalTheme.Spacing.small) {
                title
                Spacer(minLength: TerminalTheme.Spacing.xSmall)
                statusCluster
            }

            VStack(alignment: .leading, spacing: TerminalTheme.Spacing.xSmall) {
                title
                HStack(spacing: TerminalTheme.Spacing.small) {
                    StatusPillView(text: statusText)
                    Spacer(minLength: TerminalTheme.Spacing.xSmall)
                    refreshLabel
                }
            }
        }
    }

    private var title: some View {
        Text("CONSTRUCTION AI // TERMINAL")
            .font(.system(.headline, design: .monospaced).weight(.bold))
            .foregroundStyle(Color.orange)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    private var statusCluster: some View {
        HStack(spacing: TerminalTheme.Spacing.small) {
            StatusPillView(text: statusText)
            refreshLabel
        }
    }

    private var refreshLabel: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text("Last refresh")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Last refresh: \(lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")")
    }
}
