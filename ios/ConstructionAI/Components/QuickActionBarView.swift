import SwiftUI

struct QuickActionBarView: View {
    let onExplain: () -> Void
    let onDrivers: () -> Void
    let onWatch: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button("Explain", action: onExplain)
            Button("Drivers", action: onDrivers)
            Button("Watch / Pin", action: onWatch)
        }
        .buttonStyle(.bordered)
        .font(.caption)
    }
}
