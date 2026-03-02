import SwiftUI

struct OverviewView: View {
    @ObservedObject var store: DashboardStore
    @ObservedObject var prefs: TerminalPreferencesStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !store.searchText.isEmpty {
                    Text("Results Mode").font(.headline)
                    GroupBox("Alerts") {
                        ForEach(store.filteredAlerts) { alert in
                            Text(alert.title).frame(maxWidth: .infinity, alignment: .leading)
                                .onTapGesture { store.selectedAlert = alert }
                        }
                    }
                    GroupBox("Signals") {
                        ForEach(store.filteredSignals) { signal in
                            Text(signal.key).frame(maxWidth: .infinity, alignment: .leading)
                                .onTapGesture { store.selectedSignal = signal }
                        }
                    }
                    GroupBox("Regions") {
                        if store.filteredRegions.isEmpty {
                            Text("No regional matches")
                        }
                    }
                }

                ForEach(store.filteredAlerts.sorted { $0.severity.rawValue > $1.severity.rawValue }) { alert in
                    SeverityBannerView(alert: alert) {
                        prefs.toggleWatch(alertTitle: alert.title)
                    }
                    .onTapGesture { store.selectedAlert = alert }
                }

                HStack(spacing: 12) {
                    KPIStatCardView(
                        title: "CPI",
                        value: store.payload?.cpi?.value.map { String(format: "%.1f", $0) } ?? "—",
                        direction: Trend.from(delta: store.payload?.cpi?.delta3M),
                        subtitle: store.payload?.cpi?.zone ?? "No zone"
                    )
                    ForEach(Array((store.payload?.cards ?? []).prefix(3))) { card in
                        KPIStatCardView(
                            title: card.title,
                            value: card.value.map { String(format: "%.0f", $0) } ?? "—",
                            direction: Trend.from(arrow: card.trend),
                            subtitle: card.subtitle ?? ""
                        )
                    }
                }

                DenseSignalsTableView(signals: store.filteredSignals, pinned: prefs.pinnedSignalIDs) { signal in
                    store.selectedSignal = signal
                } onPin: { signal in
                    prefs.togglePinned(signalID: signal.id)
                }

                if !prefs.pinnedSignalIDs.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Pinned / Watchlist").font(.headline)
                        ForEach(store.topSignals.filter { prefs.pinnedSignalIDs.contains($0.id) }) { signal in
                            SignalRowView(signal: signal)
                        }
                    }
                    .padding(12)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(16)
        }
    }
}
