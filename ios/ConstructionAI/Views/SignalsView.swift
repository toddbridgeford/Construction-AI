import SwiftUI

struct SignalsView: View {
    @ObservedObject var store: DashboardStore

    var body: some View {
        Group {
            if store.filteredSignals.isEmpty {
                ContentUnavailableView("No matching signals", systemImage: "waveform.path.ecg", description: Text("Try broadening your search to see more market signals."))
            } else {
                List(store.filteredSignals) { signal in
                    SignalRowView(signal: signal)
                        .contentShape(Rectangle())
                        .onTapGesture { store.selectedSignal = signal }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Signals")
    }
}
