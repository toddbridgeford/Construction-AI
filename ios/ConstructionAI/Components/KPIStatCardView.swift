import SwiftUI

struct KPIStatCardView: View {
    let title: String
    let value: String
    let direction: TrendDirection
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            HStack {
                Text(value)
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                TrendArrowView(direction: direction)
            }
            Text(subtitle).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
