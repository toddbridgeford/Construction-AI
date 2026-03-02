import SwiftUI

struct TrendArrowView: View {
    let direction: TrendDirection

    private var symbol: String {
        switch direction {
        case .up: return "arrow.up"
        case .down: return "arrow.down"
        case .flat: return "arrow.right"
        case .unknown: return "minus"
        }
    }

    private var color: Color {
        switch direction {
        case .up: return .green
        case .down: return .red
        case .flat: return .secondary
        case .unknown: return .secondary
        }
    }

    var body: some View {
        Image(systemName: symbol)
            .foregroundStyle(color)
    }
}
