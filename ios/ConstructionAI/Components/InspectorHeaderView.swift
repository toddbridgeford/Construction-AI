import SwiftUI

struct InspectorHeaderView: View {
    let title: String
    let severity: Severity
    let lastUpdated: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(TerminalTheme.Typography.sectionTitle)
                Spacer()
                SeverityChipView(severity: severity)
            }
            Text("Last updated: \(lastUpdated)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .terminalPanel()
    }
}
