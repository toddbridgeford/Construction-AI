import Foundation

enum TrendDirection {
    case up, down, flat, unknown

    var symbol: String {
        switch self {
        case .up: return "arrow.up.right"
        case .down: return "arrow.down.right"
        case .flat: return "arrow.right"
        case .unknown: return "questionmark"
        }
    }
}

enum Trend {
    static func from(delta: Double?) -> TrendDirection {
        guard let delta else { return .unknown }
        if abs(delta) < 0.01 { return .flat }
        return delta > 0 ? .up : .down
    }

    static func from(current: Double?, previous: Double?) -> TrendDirection {
        guard let current, let previous else { return .unknown }
        return from(delta: current - previous)
    }

    static func from(arrow: String?) -> TrendDirection {
        switch arrow {
        case "↑", "↗": return .up
        case "↓", "↘": return .down
        case "→": return .flat
        default: return .unknown
        }
    }
}
