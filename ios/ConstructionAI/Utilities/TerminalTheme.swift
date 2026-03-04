import SwiftUI

enum TerminalTheme {
    enum Spacing {
        static let xSmall: CGFloat = 6
        static let small: CGFloat = 10
        static let medium: CGFloat = 14
        static let large: CGFloat = 18
    }

    enum Radius {
        static let chip: CGFloat = 10
        static let panel: CGFloat = 14
    }

    enum ColorSet {
        static let panelBackground = Color(uiColor: .secondarySystemBackground)
        static let panelBorder = Color(uiColor: .separator)
        static let positive = Color.green
        static let warning = Color.orange
        static let critical = Color.red
        static let neutral = Color.secondary
    }

    static func mono(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

struct TerminalPanelModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(TerminalTheme.Spacing.medium)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TerminalTheme.Radius.panel, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TerminalTheme.Radius.panel, style: .continuous)
                    .stroke(TerminalTheme.ColorSet.panelBorder.opacity(0.3), lineWidth: 1)
            )
    }
}

extension View {
    func terminalPanel() -> some View {
        modifier(TerminalPanelModifier())
    }
}
