import SwiftUI

struct QuickActionBarView: View {
    let onExplain: () -> Void
    let onDrivers: () -> Void
    let onWatch: () -> Void

    var body: some View {
        HStack(spacing: TerminalTheme.Spacing.small) {
            Button("Explain", action: onExplain)
                .buttonStyle(TerminalButtonStyle(intent: .neutral))
                .accessibilityHint("Explains why this alert is important")
            Button("Drivers", action: onDrivers)
                .buttonStyle(TerminalButtonStyle(intent: .neutral))
                .accessibilityHint("Shows the underlying market drivers")
            Button("Watch / Pin", action: onWatch)
                .buttonStyle(TerminalButtonStyle(intent: .primary))
                .accessibilityHint("Pins this item to your watch list")
        }
    }
}
