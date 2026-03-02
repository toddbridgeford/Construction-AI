import SwiftUI

struct RegionsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        List {
            if store.filteredRegions.isEmpty {
                Text("No regional data in payload")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.filteredRegions) { region in
                    VStack(alignment: .leading) {
                        Text(region.name)
                        Text(region.summary ?? "—").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Regions")
    }
}
