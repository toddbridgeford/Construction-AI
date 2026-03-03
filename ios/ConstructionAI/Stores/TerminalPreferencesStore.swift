import Foundation
import Combine

@MainActor
final class TerminalPreferencesStore: ObservableObject {
    @Published var pinnedSignalIDs: Set<String> = []
    @Published var watchlistAlertTitles: Set<String> = []

    func togglePinned(signalID: String) {
        if pinnedSignalIDs.contains(signalID) {
            pinnedSignalIDs.remove(signalID)
        } else {
            pinnedSignalIDs.insert(signalID)
        }
    }

    func toggleWatch(alertTitle: String) {
        if watchlistAlertTitles.contains(alertTitle) {
            watchlistAlertTitles.remove(alertTitle)
        } else {
            watchlistAlertTitles.insert(alertTitle)
        }
    }
}
