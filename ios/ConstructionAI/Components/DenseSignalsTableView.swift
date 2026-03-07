import SwiftUI

struct DenseSignalsTableView: View {
    let signals: [SignalItem]
    let pinned: Set<String>
    let onSelect: (SignalItem) -> Void
    let onPin: (SignalItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: TerminalTheme.Spacing.small) {
            TerminalSectionHeader(title: "Top signals", subtitle: "Priority market indicators")
            ForEach(Array(signals.enumerated()), id: \.element.id) { index, signal in
                HStack(spacing: TerminalTheme.Spacing.xSmall) {
                    Button {
                        onSelect(signal)
                    } label: {
                        HStack(spacing: TerminalTheme.Spacing.xSmall) {
                            Text(signal.key)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            TrendArrowView(direction: Trend.from(arrow: signal.arrow))
                            SeverityChipView(severity: signal.severity)
                            Text(signal.interpretation ?? "—")
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        .font(.footnote)
                    }
                    .buttonStyle(.plain)
                    .terminalTapTarget()
                    .accessibilityLabel("\(signal.key), \(signal.severity.rawValue) severity")
                    .accessibilityHint("Opens full signal details")

                    Button {
                        onPin(signal)
                    } label: {
                        Image(systemName: pinned.contains(signal.id) ? "pin.fill" : "pin")
                            .font(.body.weight(.semibold))
                    }
                    .buttonStyle(TerminalButtonStyle(intent: pinned.contains(signal.id) ? .selected : .neutral))
                    .accessibilityLabel(pinned.contains(signal.id) ? "Unpin \(signal.key)" : "Pin \(signal.key)")
                }
                if index < signals.count - 1 {
                    Divider()
                }
            }
        }
        .padding(TerminalTheme.Spacing.small)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: TerminalTheme.Radius.row))
    }
}
