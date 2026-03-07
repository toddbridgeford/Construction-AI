import SwiftUI

struct CommandPaletteView: View {
    @Binding var isPresented: Bool
    @Binding var query: String
    let results: PaletteResults
    let selectedIndex: Int
    let onSelect: (PaletteItem) -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        ZStack {
            Color.black.opacity(0.18).ignoresSafeArea().onTapGesture { isPresented = false }
            VStack(alignment: .leading, spacing: TerminalTheme.Spacing.small) {
                TextField("Type a command or search…", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .focused($isFocused)
                    .accessibilityHint("Searches navigation and terminal actions")

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(results.grouped, id: \.0) { group in
                            Text(group.0.rawValue.uppercased())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(.top, 6)
                            ForEach(group.1) { item in
                                Button {
                                    onSelect(item)
                                } label: {
                                    row(item: item, selected: selectedItemID == item.id)
                                }
                                .buttonStyle(.plain)
                                .terminalTapTarget()
                                .accessibilityLabel(item.title)
                                .accessibilityHint(item.subtitle)
                                .accessibilityAddTraits(selectedItemID == item.id ? [.isSelected] : [])
                            }
                        }
                    }
                }
                .frame(maxHeight: 420)
            }
            .padding(TerminalTheme.Spacing.large)
            .frame(maxWidth: 720)
            .terminalPanel()
            .padding(.horizontal, 16)
        }
        .onAppear { isFocused = true }
    }

    private var selectedItemID: String? {
        guard results.flat.indices.contains(selectedIndex) else { return nil }
        return results.flat[selectedIndex].id
    }

    private func row(item: PaletteItem, selected: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: item.symbol).frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                Text(item.subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(item.hint)
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(.ultraThinMaterial, in: Capsule())
        }
        .padding(8)
        .background(selected ? Color.accentColor.opacity(0.18) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
    }
}
