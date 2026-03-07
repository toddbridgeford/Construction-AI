import SwiftUI

struct DenseSignalsTableView: View {
    let signals: [SignalItem]
    let pinned: Set<String>
    let onSelect: (SignalItem) -> Void
    let onPin: (SignalItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TerminalSectionHeader(title: "Top signals", subtitle: "Priority market indicators")
            ForEach(signals) { signal in
                HStack {
                    Button {
                        onSelect(signal)
                    } label: {
                        HStack {
                            Text(signal.key).frame(maxWidth: .infinity, alignment: .leading)
                            TrendArrowView(direction: Trend.from(arrow: signal.arrow))
                            SeverityChipView(severity: signal.severity)
                            Text(signal.interpretation ?? "—")
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        .font(.footnote)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Select signal \(signal.key)")

                    Button {
                        onPin(signal)
                    } label: {
                        Image(systemName: pinned.contains(signal.id) ? "pin.fill" : "pin")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(pinned.contains(signal.id) ? "Unpin \(signal.key)" : "Pin \(signal.key)")
                }
                Divider()
            }
        }
        .padding(TerminalTheme.Spacing.small)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: TerminalTheme.Radius.row))
    }
}
