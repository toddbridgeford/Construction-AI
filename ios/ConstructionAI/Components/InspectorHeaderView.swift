import SwiftUI

struct InspectorHeaderView: View {
    let title: String
    let severity: Severity
    let lastUpdated: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                SeverityChipView(severity: severity)
            }
            Text("Last updated: \(lastUpdated)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
