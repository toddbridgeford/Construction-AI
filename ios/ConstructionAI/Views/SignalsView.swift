import SwiftUI

struct SignalsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        List(store.filteredSignals) { signal in
            SignalRowView(signal: signal)
                .contentShape(Rectangle())
                .onTapGesture { store.selectedSignal = signal }
        }
        .navigationTitle("Signals")
    }
}
