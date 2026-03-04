import SwiftUI

struct TickerStripView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TerminalTheme.Spacing.small) {
                chip(label: "CPI", value: store.payload?.cpi?.value.map { String(format: "%.1f", $0) } ?? "—", arrow: Trend.from(delta: store.payload?.cpi?.delta3M).symbol)

                ForEach(Array((store.payload?.cards ?? []).prefix(3))) { card in
                    chip(label: card.title, value: card.value.map { String(format: "%.0f", $0) } ?? "—", arrow: Trend.from(arrow: card.trend).symbol)
                }

                ForEach(store.topSignals) { signal in
                    Button {
                        store.selectedSignal = signal
                    } label: {
                        chip(label: signal.key, value: signal.value.map { String(format: "%.2f", $0) } ?? "—", arrow: Trend.from(arrow: signal.arrow).symbol)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Signal \(signal.key) \(signal.value.map { String(format: "%.2f", $0) } ?? "no value")")
                    .accessibilityHint("Opens inspector for this signal")
                }
            }
            .padding(.horizontal, TerminalTheme.Spacing.medium)
            .frame(height: 48)
        }
    }

    private func chip(label: String, value: String, arrow: String) -> some View {
        HStack(spacing: 6) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(TerminalTheme.mono(size: 13))
            Image(systemName: arrow).font(.caption2)
        }
        .padding(.horizontal, 10)
        .frame(height: 34)
        .background(TerminalTheme.ColorSet.panelBackground, in: RoundedRectangle(cornerRadius: TerminalTheme.Radius.chip, style: .continuous))
    }
}
