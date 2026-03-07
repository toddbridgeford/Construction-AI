import SwiftUI

struct RegionsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        List {
            if regions.isEmpty {
                ContentUnavailableView(
                    "No regional data",
                    systemImage: "map",
                    description: Text("No regions matched your current search.")
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
