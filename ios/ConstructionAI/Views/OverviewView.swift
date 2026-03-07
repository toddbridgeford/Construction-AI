import SwiftUI

struct OverviewView: View {
    @ObservedObject var store: DashboardStore
    @ObservedObject var prefs: TerminalPreferencesStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TerminalTheme.Spacing.medium) {
                TickerStripView(store: store)

                if isFiltering {
                    searchResultsPanel
                }

                LazyVGrid(columns: columns, spacing: TerminalTheme.Spacing.medium) {
                    executivePanel
                    alertsPanel
                    forecastPanel
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

    private var isFiltering: Bool {
        !store.searchText.isEmpty
    }

    private var columns: [GridItem] {
        if horizontalSizeClass == .regular {
            return [
                GridItem(.flexible(), spacing: TerminalTheme.Spacing.medium),
                GridItem(.flexible(), spacing: TerminalTheme.Spacing.medium)
            ]
        }
        return [GridItem(.flexible())]
    }

    private var executivePanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            TerminalSectionHeader(title: "Executive Summary")
            Text(store.payload?.executiveHeadline ?? "No executive headline")
                .font(.body.weight(.semibold))
                .lineLimit(2)
            Text(store.payload?.executiveSummary ?? "Summary unavailable")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .terminalPanel()
    }

    private var alertsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            TerminalSectionHeader(title: "Alerts", subtitle: "Highest-priority changes")
            if store.filteredAlerts.isEmpty {
                Text("No alerts for this filter.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, TerminalTheme.Spacing.xSmall)
                    .accessibilityLabel("No alerts for this filter")
            } else {
                ForEach(store.filteredAlerts.prefix(4)) { alert in
                    Button {
                        store.selectedAlert = alert
                    } label: {
                        HStack(alignment: .top, spacing: TerminalTheme.Spacing.xSmall) {
                            SeverityChipView(severity: alert.severity)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(alert.title)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(alert.message)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            Spacer(minLength: TerminalTheme.Spacing.xSmall)
                        }
                    }
                    .buttonStyle(.plain)
                    .terminalRowBackground()
                    .terminalTapTarget()
                    .accessibilityLabel("\(alert.severity.rawValue) alert \(alert.title)")
                    .accessibilityHint("Opens alert details in inspector")
                }
            }
        }
        .terminalPanel()
    }

    private var kpiPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            TerminalSectionHeader(title: "KPIs")
            ForEach(topCards) { card in
                KPIStatCardView(
                    title: card.title,
                    value: metricString(card.value, precision: 0),
                    direction: Trend.from(arrow: card.trend),
                    subtitle: card.subtitle ?? ""
                )
            }
        }
        .terminalPanel()
    }

    private var forecastPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            TerminalSectionHeader(title: "Market Forecast")

            Text("Strongest Next 12 Months")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(Array(store.forecast.strongest.prefix(3).enumerated()), id: \.element.id) { index, item in
                HStack {
                    Text("\(index + 1) \(item.market)")
                        .lineLimit(1)
                    Spacer()
                    Text(metricString(item.forecastScore, precision: 0)).font(TerminalTheme.Typography.denseMono)
                }
            }

            Divider().overlay(Color.white.opacity(0.12))

            Text("Weakest Next 12 Months")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(Array(store.forecast.weakest.prefix(3).enumerated()), id: \.element.id) { index, item in
                HStack {
                    Text("\(index + 1) \(item.market)")
                        .lineLimit(1)
                    Spacer()
                    Text(metricString(item.forecastScore, precision: 0)).font(TerminalTheme.Typography.denseMono)
                }
            }

            Text(store.forecast.headline)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 4)

            Text("Strength theme: \(store.forecast.topStrengthTheme)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text("Weakness theme: \(store.forecast.topWeaknessTheme)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .terminalPanel()
    }

    private var signalsPanel: some View {
        DenseSignalsTableView(signals: store.filteredSignals, pinned: prefs.pinnedSignalIDs) { signal in
            store.selectedSignal = signal
        } onPin: { signal in
            prefs.togglePinned(signalID: signal.id)
        }
        .frame(minHeight: 220)
        .terminalPanel()
    }

    private var regionsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            TerminalSectionHeader(title: "Regions")
            if store.filteredRegions.isEmpty {
                Text("No regions match the current filter.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, TerminalTheme.Spacing.xSmall)
            } else {
                ForEach(store.filteredRegions.prefix(5)) { region in
                    HStack {
                        Text(region.name)
                            .lineLimit(1)
                        Spacer()
                        Text(metricString(region.value, precision: 1)).font(TerminalTheme.Typography.denseMono)
                    }
                    Text(region.summary ?? "No region summary")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .padding(.bottom, TerminalTheme.Spacing.xSmall)
                }
            }
        }
        .terminalPanel()
    }

    private var sourceHealthPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            TerminalSectionHeader(title: "Source Health")
            if store.sourceHealth.isEmpty {
                Text("No source status reported in this snapshot.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, TerminalTheme.Spacing.xSmall)
            } else {
                ForEach(store.sourceHealth.prefix(6)) { source in
                    HStack {
                        Text(source.source)
                            .lineLimit(1)
                        Spacer()
                        Text(sourceStatusLabel(source.status))
                            .font(.caption)
                            .foregroundStyle(sourceStatusColor(source.status))
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(source.source): \(sourceStatusLabel(source.status))")
                }
            }
        }
        .terminalPanel()
    }

    private var searchResultsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            TerminalSectionHeader(title: "Search Results")
            Text("\(store.filteredSignals.count) signals • \(store.filteredAlerts.count) alerts • \(store.filteredRegions.count) regions")
                .foregroundStyle(.secondary)
                .font(.caption)
        }
        .terminalPanel()
        .accessibilityElement(children: .combine)
    }

    private var topCards: ArraySlice<CardItem> {
        (store.payload?.cards ?? []).prefix(3)
    }

    private func sourceStatusLabel(_ status: String) -> String {
        switch status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "error", "failed", "down":
            return "Error"
        case "warning", "degraded", "stale":
            return "Warning"
        case "available", "ok", "healthy", "live":
            return "Healthy"
        default:
            return status.isEmpty ? "Unknown" : status
        }
    }

    private func sourceStatusColor(_ status: String) -> Color {
        switch sourceStatusLabel(status) {
        case "Error":
            return .red
        case "Warning":
            return .orange
        case "Healthy":
            return .green
        default:
            return .secondary
        }
    }

    private func metricString(_ value: Double?, precision: Int, fallback: String = "—") -> String {
        guard let value else { return fallback }
        return String(format: "%.*f", precision, value)
    }

    private func metricString(_ value: Double, precision: Int) -> String {
        String(format: "%.*f", precision, value)
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
