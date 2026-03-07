import SwiftUI

struct LoadingSkeletonView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Loading dashboard…")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            RoundedRectangle(cornerRadius: 8).fill(.gray.opacity(0.2)).frame(height: 70)
            RoundedRectangle(cornerRadius: 8).fill(.gray.opacity(0.2)).frame(height: 110)
            RoundedRectangle(cornerRadius: 8).fill(.gray.opacity(0.2)).frame(height: 180)
        }
        .padding()
        .redacted(reason: .placeholder)
        .accessibilityLabel("Loading dashboard")
    }
}
