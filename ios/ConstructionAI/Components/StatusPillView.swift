import SwiftUI

struct StatusPillView: View {
    let text: String

    private var foregroundColor: Color {
        let lowercased = text.lowercased()
        if lowercased.contains("error") || lowercased.contains("fail") { return .red }
        if lowercased.contains("loading") || lowercased.contains("sync") || lowercased.contains("refresh") { return .orange }
        return .secondary
    }

    private var backgroundColor: Color {
        foregroundColor.opacity(0.14)
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(backgroundColor, in: Capsule())
            .foregroundStyle(foregroundColor)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("System status: \(text)")
    }
}
