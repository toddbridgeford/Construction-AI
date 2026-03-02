import SwiftUI

struct SignalRowView: View {
    let signal: SignalItem

    var body: some View {
        HStack {
            Text(signal.key)
            Spacer()
            TrendArrowView(direction: Trend.from(arrow: signal.arrow))
            SeverityChipView(severity: signal.severity)
        }
        .font(.subheadline)
    }
}
