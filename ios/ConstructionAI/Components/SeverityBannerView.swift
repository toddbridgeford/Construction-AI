import SwiftUI

struct SeverityBannerView: View {
    let alert: AlertItem
    let onWatch: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SeverityChipView(severity: alert.severity)
                Text(alert.title).font(.headline)
            }
            Text(alert.message).font(.subheadline)
            QuickActionBarView(onExplain: {}, onDrivers: {}, onWatch: onWatch)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
