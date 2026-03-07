import SwiftUI

struct SeverityChipView: View {
    let severity: Severity

    private var color: Color {
        switch severity {
        case .critical: return .red
        case .monitor: return .orange
        case .watch: return .yellow
        case .normal: return .green
        case .unknown: return .gray
        }
    }

    var body: some View {
        Text(severity.rawValue)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.2), in: Capsule())
            .foregroundStyle(color)
            .accessibilityLabel("Severity \(severity.rawValue)")
    }
}
