import SwiftUI
#if canImport(UIKit)
import UIKit

struct KeyCommandHostingView: UIViewRepresentable {
    let onCommand: (KeyCommandAction) -> Void

    func makeUIView(context: Context) -> CommandView {
        let view = CommandView()
        view.onCommand = onCommand
        DispatchQueue.main.async {
            view.becomeFirstResponder()
        }
        return view
    }

    func updateUIView(_ uiView: CommandView, context: Context) {
        uiView.onCommand = onCommand
    }
}

final class CommandView: UIView {
    var onCommand: ((KeyCommandAction) -> Void)?

    override var canBecomeFirstResponder: Bool { true }

    override var keyCommands: [UIKeyCommand]? {
        [
            UIKeyCommand(input: "k", modifierFlags: .command, action: #selector(openPalette)),
            UIKeyCommand(input: "r", modifierFlags: .command, action: #selector(refresh)),
            UIKeyCommand(input: "f", modifierFlags: .command, action: #selector(focusSearch)),
            UIKeyCommand(input: "1", modifierFlags: .command, action: #selector(nav1)),
            UIKeyCommand(input: "2", modifierFlags: .command, action: #selector(nav2)),
            UIKeyCommand(input: "3", modifierFlags: .command, action: #selector(nav3)),
            UIKeyCommand(input: "4", modifierFlags: .command, action: #selector(nav4)),
            UIKeyCommand(input: "5", modifierFlags: .command, action: #selector(nav5)),
            UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(dismissPalette)),
            UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(up)),
            UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(down)),
            UIKeyCommand(input: "\r", modifierFlags: [], action: #selector(execute))
        ]
    }

    @objc private func openPalette() { onCommand?(.openPalette) }
    @objc private func refresh() { onCommand?(.refresh) }
    @objc private func focusSearch() { onCommand?(.focusSearch) }
    @objc private func nav1() { onCommand?(.navigate(1)) }
    @objc private func nav2() { onCommand?(.navigate(2)) }
    @objc private func nav3() { onCommand?(.navigate(3)) }
    @objc private func nav4() { onCommand?(.navigate(4)) }
    @objc private func nav5() { onCommand?(.navigate(5)) }
    @objc private func dismissPalette() { onCommand?(.dismiss) }
    @objc private func up() { onCommand?(.up) }
    @objc private func down() { onCommand?(.down) }
    @objc private func execute() { onCommand?(.execute) }
}
#else
struct KeyCommandHostingView: View {
    let onCommand: (KeyCommandAction) -> Void
    var body: some View { EmptyView() }
}
#endif
