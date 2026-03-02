import SwiftUI

struct DenseSignalsTableView: View {
    let signals: [SignalItem]
    let pinned: Set<String>
    let onSelect: (SignalItem) -> Void
    let onPin: (SignalItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Top 5 Signals").font(.headline)
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

                    Button {
                        onPin(signal)
                    } label: {
                        Image(systemName: pinned.contains(signal.id) ? "pin.fill" : "pin")
                    }
                    .buttonStyle(.plain)
                }
                Divider()
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
