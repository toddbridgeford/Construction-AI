import SwiftUI

struct SignalRowView: View {
    let signal: SignalItem

    var body: some View {
        HStack(alignment: .top, spacing: TerminalTheme.Spacing.small) {
            VStack(alignment: .leading, spacing: 2) {
                Text(signal.key)
                    .lineLimit(1)
                Text(signal.interpretation ?? "No interpretation")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer()
            TrendArrowView(direction: Trend.from(arrow: signal.arrow))
            SeverityChipView(severity: signal.severity)
        }
        .font(.subheadline)
        .terminalRowBackground()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(signal.key), \(signal.severity.rawValue) severity, \(signal.interpretation ?? "No interpretation")")
    }
}
