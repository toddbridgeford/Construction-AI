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
        static let row: CGFloat = 12
    }

    enum ColorSet {
        static let panelBackground = Color(uiColor: .secondarySystemBackground)
        static let panelBorder = Color(uiColor: .separator)
        static let positive = Color.green
        static let warning = Color.orange
        static let critical = Color.red
        static let neutral = Color.secondary
    }

    enum Typography {
        static let sectionTitle = Font.system(.headline, design: .default).weight(.semibold)
        static let sectionSubtitle = Font.subheadline
        static let bodyMono = Font.system(.subheadline, design: .monospaced)
        static let denseMono = Font.system(size: 13, weight: .semibold, design: .monospaced)
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

    func terminalRowBackground() -> some View {
        self
            .padding(.vertical, TerminalTheme.Spacing.xSmall)
            .padding(.horizontal, TerminalTheme.Spacing.small)
            .background(
                RoundedRectangle(cornerRadius: TerminalTheme.Radius.row, style: .continuous)
                    .fill(TerminalTheme.ColorSet.panelBackground.opacity(0.65))
            )
    }

    func terminalTapTarget() -> some View {
        self
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

struct TerminalSectionHeader: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(TerminalTheme.Typography.sectionTitle)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(TerminalTheme.Typography.sectionSubtitle)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
