import SwiftUI

struct TerminalTopBarView: View {
    @Binding var searchText: String
    let statusText: String
    let lastRefresh: Date?

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                Text("CONSTRUCTION AI // TERMINAL")
                    .font(.system(.headline, design: .monospaced).weight(.bold))
                    .foregroundStyle(Color.orange)
                Spacer()
                StatusPillView(text: statusText)
                Text(lastRefresh.map { DateFormatting.shortDateTime.string(from: $0) } ?? "Never")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            TextField("Search alerts, signals, regions", text: $searchText)
                .textFieldStyle(.roundedBorder)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(uiColor: .secondarySystemBackground).opacity(0.9))
        )
        .padding(.horizontal, 8)
        .padding(.top, 8)
    }
}
