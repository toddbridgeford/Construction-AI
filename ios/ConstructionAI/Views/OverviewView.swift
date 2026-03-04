import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct OverviewView: View {
    @ObservedObject var store: DashboardStore
    @ObservedObject var prefs: TerminalPreferencesStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TerminalTheme.Spacing.medium) {
                TickerStripView(store: store)

                if !store.searchText.isEmpty {
                    searchResultsPanel
                }

                LazyVGrid(columns: columns, spacing: TerminalTheme.Spacing.medium) {
                    executivePanel
                    alertsPanel
                    kpiPanel
                    signalsPanel
                    regionsPanel
                    sourceHealthPanel
                }
                .background(OverviewGridSignpost())
            }
            .padding(TerminalTheme.Spacing.medium)
        }
        .searchable(text: $store.searchText)
    }

    private var columns: [GridItem] {
        #if canImport(UIKit)
        let idiom = UIDevice.current.userInterfaceIdiom
        if idiom == .pad {
            let landscape = UIScreen.main.bounds.width > UIScreen.main.bounds.height
            return Array(repeating: GridItem(.flexible(), spacing: TerminalTheme.Spacing.medium), count: landscape ? 3 : 2)
        }
        #endif
        return [GridItem(.flexible())]
    }

    private var executivePanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Executive Summary").font(.headline)
            Text(store.payload?.executiveHeadline ?? "No executive headline")
            Text(store.payload?.executiveSummary ?? "Summary unavailable")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .terminalPanel()
    }

    private var alertsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Alerts").font(.headline)
            ForEach(store.filteredAlerts.prefix(4)) { alert in
                HStack {
                    SeverityChipView(severity: alert.severity)
                    VStack(alignment: .leading) {
                        Text(alert.title).lineLimit(1)
                        Text(alert.message).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                }
                .contentShape(Rectangle())
                .onTapGesture { store.selectedAlert = alert }
                .accessibilityLabel("\(alert.severity.rawValue) alert \(alert.title)")
            }
        }
        .terminalPanel()
    }

    private var kpiPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("KPIs").font(.headline)
            ForEach(Array((store.payload?.cards ?? []).prefix(3))) { card in
                KPIStatCardView(title: card.title, value: card.value.map { String(format: "%.0f", $0) } ?? "—", direction: Trend.from(arrow: card.trend), subtitle: card.subtitle ?? "")
            }
        }
        .terminalPanel()
    }

    private var signalsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Signals").font(.headline)
            DenseSignalsTableView(signals: store.filteredSignals, pinned: prefs.pinnedSignalIDs) { signal in
                store.selectedSignal = signal
            } onPin: { signal in
                prefs.togglePinned(signalID: signal.id)
            }
            .frame(minHeight: 220)
        }
        .terminalPanel()
    }

    private var regionsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Regions").font(.headline)
            ForEach(store.filteredRegions.prefix(5)) { region in
                HStack {
                    Text(region.name)
                    Spacer()
                    Text(region.value.map { String(format: "%.1f", $0) } ?? "—").font(TerminalTheme.mono(size: 13))
                }
                Text(region.summary ?? "No region summary")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .terminalPanel()
    }

    private var sourceHealthPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Source Health").font(.headline)
            ForEach(store.sourceHealth.prefix(6)) { source in
                HStack {
                    Text(source.source)
                    Spacer()
                    Text(source.status).font(.caption).foregroundStyle(source.status == "error" ? .red : .secondary)
                }
            }
        }
        .terminalPanel()
    }

    private var searchResultsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Search Results")
                .font(.headline)
            Text("\(store.filteredSignals.count) signals • \(store.filteredAlerts.count) alerts • \(store.filteredRegions.count) regions")
                .foregroundStyle(.secondary)
                .font(.caption)
        }
        .terminalPanel()
    }
}

private struct OverviewGridSignpost: View {
    var body: some View {
        Color.clear
            .onAppear {
                AppLogger.ui.debug("Overview grid appeared")
            }
    }
}
