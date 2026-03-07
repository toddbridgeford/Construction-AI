import SwiftUI

struct EmptyStateView: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: TerminalTheme.Spacing.medium) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.secondary)
            TerminalSectionHeader(title: "No dashboard data available", subtitle: "We could not load a snapshot. Check connection and retry.")
                .multilineTextAlignment(.center)
            Button("Retry", action: retry)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityHint("Attempts to refresh dashboard data")
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .terminalPanel()
        .padding(.horizontal, TerminalTheme.Spacing.medium)
    }
}
