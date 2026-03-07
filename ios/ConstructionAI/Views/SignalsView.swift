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
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Signals")
    }
}
