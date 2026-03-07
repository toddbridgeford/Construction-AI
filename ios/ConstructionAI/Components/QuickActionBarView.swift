import SwiftUI

struct QuickActionBarView: View {
    let onExplain: () -> Void
    let onDrivers: () -> Void
    let onWatch: () -> Void

    var body: some View {
        ViewThatFits {
            HStack(spacing: TerminalTheme.Spacing.small) {
                explainButton
                driversButton
                watchButton
            }

            VStack(alignment: .leading, spacing: TerminalTheme.Spacing.small) {
                explainButton
                driversButton
                watchButton
            }
        }
    }

    private var explainButton: some View {
        Button("Explain", action: onExplain)
            .buttonStyle(TerminalButtonStyle(intent: .neutral))
            .accessibilityHint("Explains why this alert is important")
    }

    private var driversButton: some View {
        Button("Drivers", action: onDrivers)
            .buttonStyle(TerminalButtonStyle(intent: .neutral))
            .accessibilityHint("Shows the underlying market drivers")
    }

    private var watchButton: some View {
        Button("Watch / Pin", action: onWatch)
            .buttonStyle(TerminalButtonStyle(intent: .primary))
            .accessibilityHint("Pins this item to your watch list")
    }
}
