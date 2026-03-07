import SwiftUI

struct SeverityChipView: View {
    let severity: Severity

    private var color: Color {
        switch severity {
        case .critical: return TerminalTheme.ColorSet.critical
        case .monitor: return TerminalTheme.ColorSet.warning
        case .watch: return .yellow
        case .normal: return TerminalTheme.ColorSet.positive
        case .unknown: return .gray
        }
    }

    var body: some View {
        Text(severity.rawValue)
            .font(.caption2.weight(.bold))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.2), in: Capsule())
            .foregroundStyle(color)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Severity: \(severity.rawValue)")
    }
}
