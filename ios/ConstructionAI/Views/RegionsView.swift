import SwiftUI

struct RegionsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        List {
            if regions.isEmpty {
                ContentUnavailableView(
                    regionsEmptyTitle,
                    systemImage: "map",
                    description: Text(regionsEmptyDescription)
                )
                .listRowBackground(Color.clear)
                .terminalListRowStyle()
            } else {
                ForEach(regions) { region in
                    regionRow(region)
                        .terminalListRowStyle()
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Regions")
    }

    private var regions: [RegionItem] {
        store.filteredRegions
    }

    private var hasActiveSearch: Bool {
        !store.searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var regionsEmptyTitle: String {
        hasActiveSearch ? "No matching regions" : "No regional data yet"
    }

    private var regionsEmptyDescription: String {
        hasActiveSearch
            ? "Try broadening your search to see more regions."
            : "Pull to refresh or tap Retry Fetch in Settings to load the latest regional snapshot."
    }

    @ViewBuilder
    private func regionRow(_ region: RegionItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(region.name)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Text(region.summary ?? "—")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: TerminalTheme.Spacing.small)
            Text(regionValue(region))
                .font(.system(.title3, design: .monospaced).weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(minWidth: 56, alignment: .trailing)
                .foregroundStyle(.orange)
        }
        .terminalRowBackground()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(region.name), value \(regionValue(region, fallback: "not available"))")
    }

    private func regionValue(_ region: RegionItem, fallback: String = "—") -> String {
        region.value.map { String(format: "%.0f", $0) } ?? fallback
    }
}
