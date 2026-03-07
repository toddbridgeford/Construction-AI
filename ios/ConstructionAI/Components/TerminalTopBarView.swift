import SwiftUI

struct TerminalTopBarView: View {
    @Binding var searchText: String
    let statusText: String
    let lastRefresh: Date?

    var body: some View {
        VStack(spacing: TerminalTheme.Spacing.xSmall) {
            HStack(spacing: TerminalTheme.Spacing.small) {
                Text("CONSTRUCTION AI // TERMINAL")
                    .font(.system(.headline, design: .monospaced).weight(.bold))
                    .foregroundStyle(Color.orange)
                Spacer()
                StatusPillView(text: statusText)
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Last refresh")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            TextField("Search alerts, signals, regions", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Search terminal data")
        }
        .padding(.horizontal, TerminalTheme.Spacing.medium)
        .padding(.vertical, TerminalTheme.Spacing.small)
        .terminalPanel()
        .padding(.horizontal, TerminalTheme.Spacing.small)
        .padding(.top, TerminalTheme.Spacing.small)
    }
}
