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

enum TerminalButtonIntent {
    case neutral
    case primary
    case destructive
    case selected
}

struct TerminalButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    let intent: TerminalButtonIntent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.weight(.semibold))
            .padding(.horizontal, TerminalTheme.Spacing.small)
            .padding(.vertical, TerminalTheme.Spacing.xSmall)
            .frame(minWidth: 44, minHeight: 36)
            .foregroundStyle(foregroundColor(isEnabled: isEnabled))
            .background(backgroundColor(pressed: configuration.isPressed), in: RoundedRectangle(cornerRadius: TerminalTheme.Radius.chip, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TerminalTheme.Radius.chip, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: TerminalTheme.Radius.chip, style: .continuous))
            .opacity(configuration.isPressed ? 0.88 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private func backgroundColor(pressed: Bool) -> Color {
        let base: Color
        switch intent {
        case .neutral: base = Color(uiColor: .tertiarySystemFill)
        case .primary: base = Color.orange.opacity(0.2)
        case .destructive: base = Color.red.opacity(0.16)
        case .selected: base = Color.accentColor.opacity(0.2)
        }
        return pressed ? base.opacity(0.75) : base
    }

    private func foregroundColor(isEnabled: Bool) -> Color {
        if !isEnabled { return .secondary }
        switch intent {
        case .neutral: return .primary
        case .primary: return .orange
        case .destructive: return .red
        case .selected: return .accentColor
        }
    }

    private var borderColor: Color {
        switch intent {
        case .neutral: return TerminalTheme.ColorSet.panelBorder.opacity(0.3)
        case .primary: return Color.orange.opacity(0.45)
        case .destructive: return Color.red.opacity(0.35)
        case .selected: return Color.accentColor.opacity(0.5)
        }
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

    func terminalListRowStyle() -> some View {
        self
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
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
