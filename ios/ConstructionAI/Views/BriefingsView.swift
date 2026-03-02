import SwiftUI

struct BriefingsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(store.payload?.executiveHeadline ?? "Executive Briefing")
                    .font(.title3.weight(.semibold))
                Text(store.payload?.executiveSummary ?? "No summary available.")
                    .foregroundStyle(.secondary)
            }
            .padding(16)
        }
        .navigationTitle("Briefings")
    }
}
