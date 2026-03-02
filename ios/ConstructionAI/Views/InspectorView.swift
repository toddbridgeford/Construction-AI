import SwiftUI

struct InspectorView: View {
    let signal: SignalItem?
    let alert: AlertItem?
    let generatedAt: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let signal {
                InspectorHeaderView(title: signal.key, severity: signal.severity, lastUpdated: DateFormatting.display(generatedAt))
                Text("What changed")
                    .font(.headline)
                HStack {
                    TrendArrowView(direction: Trend.from(arrow: signal.arrow))
                    Text(signal.value.map { String(format: "%.2f", $0) } ?? "—").monospacedDigit()
                }
                Text("Why it matters")
                    .font(.headline)
                Text(signal.interpretation ?? "No interpretation provided.")
                Button("Copy Summary") {
                    #if canImport(UIKit)
                    UIPasteboard.general.string = "\(signal.key): \(signal.interpretation ?? "No interpretation")"
                    #endif
                }
                .buttonStyle(.bordered)
            } else if let alert {
                InspectorHeaderView(title: alert.title, severity: alert.severity, lastUpdated: DateFormatting.display(generatedAt))
                Text(alert.message)
            } else {
                Text("Select an item to inspect")
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(16)
    }
}
