import Foundation

enum PaletteCategory: String, CaseIterable {
    case navigate = "Navigate"
    case actions = "Actions"
    case signals = "Signals"
    case alerts = "Alerts"
    case regions = "Regions"
}

enum PaletteHintStyle: String {
    case command
    case action
    case jump
}

struct PaletteItem: Identifiable, Hashable {
    let id: String
    let category: PaletteCategory
    let title: String
    let subtitle: String
    let symbol: String
    let hint: String
    let hintStyle: PaletteHintStyle
    let keywords: [String]
    let priority: Int
    let action: PaletteAction
}

struct PaletteResults {
    let grouped: [(PaletteCategory, [PaletteItem])]
    let flat: [PaletteItem]
}

enum PaletteAction: Hashable {
    case navigate(String)
    case refresh
    case clearCache
    case copyExecutiveSummary
    case selectSignal(String)
    case selectAlert(String)
    case showRegion(String)
}

enum PaletteScorer {
    static func score(item: PaletteItem, query: String) -> Int {
        let normalized = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return item.priority }

        let title = item.title.lowercased()
        let subtitle = item.subtitle.lowercased()

        var total = item.priority
        if title.hasPrefix(normalized) { total += 120 }
        if title.contains(" \(normalized)") || title.contains("-\(normalized)") { total += 100 }
        if title.contains(normalized) { total += 60 }
        if subtitle.contains(normalized) { total += 25 }
        if item.keywords.contains(where: { $0.lowercased().contains(normalized) }) { total += 30 }

        let tokens = normalized.split(separator: " ").map(String.init)
        let matched = tokens.filter { token in
            title.contains(token) || subtitle.contains(token) || item.keywords.contains(where: { $0.lowercased().contains(token) })
        }
        total += matched.count * 12
        if !tokens.isEmpty && matched.count == tokens.count { total += 25 }
        return total
    }

    static func results(items: [PaletteItem], query: String, limitPerCategory: Int = 8) -> PaletteResults {
        let scored = items
            .map { ($0, score(item: $0, query: query)) }
            .filter { query.isEmpty || $0.1 > $0.0.priority }
            .sorted { lhs, rhs in lhs.1 > rhs.1 }
            .map(\.0)

        var grouped: [(PaletteCategory, [PaletteItem])] = []
        for category in PaletteCategory.allCases {
            let items = scored.filter { $0.category == category }
            if !items.isEmpty {
                grouped.append((category, Array(items.prefix(limitPerCategory))))
            }
        }

        return PaletteResults(grouped: grouped, flat: grouped.flatMap { $0.1 })
    }
}

struct PaletteSelectionState {
    var selectedIndex: Int = 0

    mutating func moveUp(maxCount: Int) {
        guard maxCount > 0 else { return }
        selectedIndex = Swift.max(selectedIndex - 1, 0)
    }

    mutating func moveDown(maxCount: Int) {
        guard maxCount > 0 else { return }
        selectedIndex = Swift.min(selectedIndex + 1, maxCount - 1)
    }
}
