import Foundation

@MainActor
final class DashboardStore: ObservableObject {
    @Published var payload: DashboardPayload?
    @Published var statusText: String = "Loading…"
    @Published var isLoading: Bool = false
    @Published var lastRefresh: Date?
    @Published var errorMessage: String?
    @Published var searchText: String = ""
    @Published var selectedSignal: SignalItem?
    @Published var selectedAlert: AlertItem?

    private let service = GitHubDashboardService()

    func bootstrap() {
        payload = DiskCache.load()
        if payload != nil {
            statusText = "Offline (cached)"
        }
        Task {
            await refreshFromGitHub()
        }
    }

    func refreshFromGitHub() async {
        isLoading = true
        errorMessage = nil
        statusText = "Loading…"

        do {
            let (latest, fetchedAt) = try await service.fetchDashboard()
            payload = latest
            lastRefresh = fetchedAt
            statusText = "Loaded ✅ from GitHub"
            DiskCache.save(latest)
        } catch {
            if payload != nil {
                statusText = "Offline (cached)"
                errorMessage = "Could not refresh from GitHub. Showing last-good snapshot."
            } else {
                statusText = "Offline (cached)"
                errorMessage = "Unable to load dashboard. Check connection and retry."
            }
        }

        isLoading = false
    }

    func clearCache() {
        DiskCache.clear()
    }

    var hasNoData: Bool {
        payload == nil && !isLoading
    }

    var topSignals: [SignalItem] {
        Array((payload?.signals ?? []).prefix(5))
    }

    var filteredAlerts: [AlertItem] {
        guard let alerts = payload?.alerts else { return [] }
        guard !searchText.isEmpty else { return alerts.sorted { $0.severity.rawValue > $1.severity.rawValue } }
        return alerts.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.message.localizedCaseInsensitiveContains(searchText)
        }
    }

    var filteredSignals: [SignalItem] {
        guard let signals = payload?.signals else { return [] }
        guard !searchText.isEmpty else { return topSignals }
        return signals.filter { $0.key.localizedCaseInsensitiveContains(searchText) }
    }

    var filteredRegions: [RegionItem] { [] }
}
