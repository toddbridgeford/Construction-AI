import Foundation
import Combine

@MainActor
final class DashboardStore: ObservableObject {
    @Published var payload: DashboardPayload?
    @Published var statusText: String = "Loading…"
    @Published var isLoading: Bool = true
    @Published var lastRefresh: Date?
    @Published var errorMessage: String?
    @Published var searchText: String = ""
    @Published private(set) var debouncedSearchText: String = ""
    @Published var selectedSignal: SignalItem?
    @Published var selectedAlert: AlertItem?
    @Published var regions: [RegionItem] = []
    @Published var sourceHealth: [SourceHealthItem] = []
    @Published var forecast: ForecastViewModel = .empty

    private let service = GitHubDashboardService()
    private var refreshTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init() {
        $searchText
            .debounce(for: .milliseconds(220), scheduler: RunLoop.main)
            .removeDuplicates()
            .assign(to: &$debouncedSearchText)
    }

    func bootstrap() {
        payload = DiskCache.load()
        if payload != nil {
            statusText = "Offline (cached)"
            sourceHealth = payload?.sources ?? []
        }
        refreshTask?.cancel()
        refreshTask = Task { await refreshFromGitHub() }
    }

    func refreshFromGitHub() async {
        isLoading = true
        errorMessage = nil
        statusText = "Loading…"

        do {
            let bundle = try await service.fetchDashboardBundle()
            selectedSignal = selectionMatch(for: selectedSignal, in: bundle.payload.signals)
            selectedAlert = selectionMatch(for: selectedAlert, in: bundle.payload.alerts)
            payload = bundle.payload
            regions = bundle.regions
            sourceHealth = bundle.sourceHealth
            forecast = bundle.forecast
            lastRefresh = bundle.fetchedAt
            statusText = "Loaded ✅ from APIs"
            DiskCache.save(bundle.payload)
        } catch {
            if payload != nil {
                statusText = "Offline (cached)"
                errorMessage = "Could not refresh from APIs. Showing last-good snapshot. \(error.localizedDescription)"
            } else {
                statusText = "Offline (cached)"
                errorMessage = "Unable to load dashboard. Check connection and retry. \(error.localizedDescription)"
            }
            sourceHealth = payload?.sources ?? []
        }

        isLoading = false
    }

    func clearCache() {
        DiskCache.clear()
    }

    var hasNoData: Bool { payload == nil && !isLoading }
    var topSignals: [SignalItem] { Array((payload?.signals ?? []).prefix(5)) }

    var filteredAlerts: [AlertItem] {
        guard let alerts = payload?.alerts else { return [] }
        guard !debouncedSearchText.isEmpty else {
            return alerts.sorted { $0.severity.rawValue > $1.severity.rawValue }
        }
        return alerts.filter {
            $0.title.localizedCaseInsensitiveContains(debouncedSearchText) ||
            $0.message.localizedCaseInsensitiveContains(debouncedSearchText)
        }
    }

    var filteredSignals: [SignalItem] {
        guard let signals = payload?.signals else { return [] }
        guard !debouncedSearchText.isEmpty else { return signals }
        return signals.filter { $0.key.localizedCaseInsensitiveContains(debouncedSearchText) }
    }

    var filteredRegions: [RegionItem] {
        guard !debouncedSearchText.isEmpty else { return regions }
        return regions.filter {
            $0.name.localizedCaseInsensitiveContains(debouncedSearchText) ||
            ($0.summary?.localizedCaseInsensitiveContains(debouncedSearchText) ?? false)
        }
    }

    private func selectionMatch<T: Hashable & Identifiable>(for current: T?, in candidates: [T]) -> T? where T.ID: Hashable {
        guard let current else { return nil }
        return candidates.first(where: { $0.id == current.id })
    }
}
