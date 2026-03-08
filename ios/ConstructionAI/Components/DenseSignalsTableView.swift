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
                HStack(alignment: .top, spacing: TerminalTheme.Spacing.xSmall) {
                    Button {
                        onSelect(signal)
                    } label: {
                        HStack(alignment: .firstTextBaseline, spacing: TerminalTheme.Spacing.xSmall) {
                            Text(signal.key)
                                .lineLimit(1)
                                .minimumScaleFactor(0.88)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            TrendArrowView(direction: Trend.from(arrow: signal.arrow))
                            SeverityChipView(severity: signal.severity)
                            Text(signal.interpretation ?? "—")
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.tail)
                                .frame(minWidth: 96, alignment: .leading)
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
                            .frame(width: 18, height: 18)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(TerminalButtonStyle(intent: pinned.contains(signal.id) ? .selected : .neutral))
                    .accessibilityLabel(pinned.contains(signal.id) ? "Unpin \(signal.key)" : "Pin \(signal.key)")
                    .accessibilityHint("Adds or removes this signal from your pinned list")
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
