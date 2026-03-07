import SwiftUI

struct QuickActionBarView: View {
    let onExplain: () -> Void
    let onDrivers: () -> Void
    let onWatch: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button("Explain", action: onExplain)
                .terminalTapTarget()
                .accessibilityHint("Explains why this alert is important")
            Button("Drivers", action: onDrivers)
                .terminalTapTarget()
                .accessibilityHint("Shows the underlying market drivers")
            Button("Watch / Pin", action: onWatch)
                .terminalTapTarget()
                .accessibilityHint("Pins this item to your watch list")
        }
        .buttonStyle(.bordered)
        .font(.caption)
        .controlSize(.large)
    }
}
