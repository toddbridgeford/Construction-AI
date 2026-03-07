import SwiftUI

struct RegionsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        List {
            if store.filteredRegions.isEmpty {
                ContentUnavailableView("No regional data", systemImage: "map", description: Text("No regions matched your current search."))
                    .listRowBackground(Color.clear)
            } else {
                ForEach(store.filteredRegions) { region in
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(region.name)
                                .font(.headline)
                            Text(region.summary ?? "—")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                        Spacer()
                        Text(region.value.map { String(format: "%.0f", $0) } ?? "—")
                            .font(.system(.title3, design: .monospaced).weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                    .terminalRowBackground()
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Regions")
    }
}
