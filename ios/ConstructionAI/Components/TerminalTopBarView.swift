import SwiftUI

struct TerminalTopBarView: View {
    @Binding var searchText: String
    let statusText: String
    let lastRefresh: Date?

    var body: some View {
        HStack(spacing: 12) {
            Text("Construction AI")
                .font(.title3.weight(.bold))
            TextField("Search alerts, signals, regions", text: $searchText)
                .textFieldStyle(.roundedBorder)
            StatusPillView(text: statusText)
            Text(lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.thinMaterial)
    }
}
