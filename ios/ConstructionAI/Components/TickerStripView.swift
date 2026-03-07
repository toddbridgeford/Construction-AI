import SwiftUI

struct TickerStripView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TerminalTheme.Spacing.small) {
                chip(label: "CPI", value: cpiValue, arrow: cpiArrow)

                ForEach(topCards) { card in
                    chip(
                        label: card.title,
                        value: metricValue(card.value, precision: 0),
                        arrow: Trend.from(arrow: card.trend).symbol
                    )
                }

                ForEach(store.topSignals) { signal in
                    let signalValue = metricValue(signal.value, precision: 2)
                    Button {
                        store.selectedSignal = signal
                    } label: {
                        chip(
                            label: signal.key,
                            value: signalValue,
                            arrow: Trend.from(arrow: signal.arrow).symbol
                        )
                    }
                    .buttonStyle(.plain)
                    .terminalTapTarget()
                    .accessibilityLabel("Signal \(signal.key) \(signalValue)")
                    .accessibilityHint("Opens inspector for this signal")
                }
            }
            .padding(.horizontal, TerminalTheme.Spacing.medium)
            .frame(minHeight: 48)
        }
        .accessibilityElement(children: .contain)
    }

    private var cpiValue: String {
        metricValue(store.payload?.cpi?.value, precision: 1)
    }

    private var cpiArrow: String {
        Trend.from(delta: store.payload?.cpi?.delta3M).symbol
    }

    private var topCards: ArraySlice<CardItem> {
        (store.payload?.cards ?? []).prefix(3)
    }

    private func metricValue(_ value: Double?, precision: Int, fallback: String = "—") -> String {
        guard let value else { return fallback }
        return String(format: "%.*f", precision, value)
    }

    private func chip(label: String, value: String, arrow: String) -> some View {
        HStack(spacing: 6) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(TerminalTheme.Typography.denseMono)
            Image(systemName: arrow).font(.caption2)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.85)
        .padding(.horizontal, 10)
        .frame(minHeight: 34)
        .background(TerminalTheme.ColorSet.panelBackground, in: RoundedRectangle(cornerRadius: TerminalTheme.Radius.chip, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
