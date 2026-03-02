import SwiftUI

struct EmptyStateView: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.largeTitle)
            Text("No dashboard data available")
                .font(.headline)
            Button("Retry", action: retry)
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}
