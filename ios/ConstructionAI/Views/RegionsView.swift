import SwiftUI

struct RegionsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        List {
            if store.filteredRegions.isEmpty {
                Text("No regional data available")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.filteredRegions) { region in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(region.name)
                                .font(.headline)
                            Text(region.summary ?? "—")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(region.value.map { String(format: "%.0f", $0) } ?? "—")
                            .font(.system(.title3, design: .monospaced).weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Regions")
    }
}
