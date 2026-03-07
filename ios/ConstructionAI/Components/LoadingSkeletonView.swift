import SwiftUI

struct LoadingSkeletonView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: TerminalTheme.Spacing.small) {
            TerminalSectionHeader(title: "Loading dashboard", subtitle: "Fetching latest construction market snapshot")

            RoundedRectangle(cornerRadius: 8).fill(.gray.opacity(0.2)).frame(height: 70)
            RoundedRectangle(cornerRadius: 8).fill(.gray.opacity(0.2)).frame(height: 110)
            RoundedRectangle(cornerRadius: 8).fill(.gray.opacity(0.2)).frame(height: 180)
        }
        .padding(TerminalTheme.Spacing.medium)
        .terminalPanel()
        .padding(.horizontal, TerminalTheme.Spacing.medium)
        .redacted(reason: .placeholder)
        .accessibilityLabel("Loading dashboard")
    }
}
