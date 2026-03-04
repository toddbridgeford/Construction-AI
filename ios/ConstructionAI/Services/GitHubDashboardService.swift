import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct DashboardBundle {
    let payload: DashboardPayload
    let fetchedAt: Date
    let regions: [RegionItem]
    let sourceHealth: [SourceHealthItem]
}

struct GitHubDashboardService {
    func fetchDashboardBundle() async throws -> DashboardBundle {
        let fetchSignpost = Signpost.begin("Dashboard Bundle Fetch")
        defer { Signpost.end("Dashboard Bundle Fetch", id: fetchSignpost) }

        async let dashboardResponse = fetchDashboard()
        async let marketResponse = fetchMarketFeeds()

        let (payload, fetchedAt) = try await dashboardResponse
        let marketResult = await marketResponse

        let mergedSources = mergeSourceHealth(base: payload.sources, marketSources: marketResult.health)
        return DashboardBundle(payload: payload, fetchedAt: fetchedAt, regions: marketResult.regions, sourceHealth: mergedSources)
    }

    private func fetchDashboard() async throws -> (DashboardPayload, Date) {
        var request = URLRequest(url: RuntimeConfig.dashboardURL)
        request.timeoutInterval = Config.requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData

        if let token = Config.githubToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            AppLogger.network.info("Authenticated dashboard fetch enabled")
        } else {
            AppLogger.network.info("Unauthenticated dashboard fetch enabled")
        }

        let fetchSignpost = Signpost.begin("Dashboard Fetch")
        let (data, response) = try await URLSession.shared.data(for: request)
        Signpost.end("Dashboard Fetch", id: fetchSignpost)

        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard http.statusCode == 200 else {
            AppLogger.network.error("Dashboard fetch failed with status \(http.statusCode)")
            throw DashboardServiceError.httpStatus(http.statusCode)
        }

        let decodeSignpost = Signpost.begin("Dashboard Decode")
        do {
            let payload = try JSONDecoder().decode(DashboardPayload.self, from: data)
            Signpost.end("Dashboard Decode", id: decodeSignpost)
            return (payload, Date())
        } catch {
            Signpost.end("Dashboard Decode", id: decodeSignpost)
            AppLogger.network.error("Dashboard decode failed")
            throw DashboardServiceError.decoding(error)
        }
    }

    private func fetchMarketFeeds() async -> (regions: [RegionItem], health: [SourceHealthItem]) {
        await withTaskGroup(of: (RegionItem?, SourceHealthItem).self) { group in
            for feed in RuntimeConfig.marketSignalFeeds {
                group.addTask {
                    do {
                        var request = URLRequest(url: feed.url)
                        request.timeoutInterval = Config.requestTimeout
                        let signpost = Signpost.begin("Market Feed Fetch")
                        let (data, response) = try await URLSession.shared.data(for: request)
                        Signpost.end("Market Feed Fetch", id: signpost)
                        guard let http = response as? HTTPURLResponse else {
                            return (nil, SourceHealthItem(source: "\(feed.name) Feed", status: "error", detail: "Invalid HTTP response."))
                        }
                        guard http.statusCode == 200 else {
                            return (nil, SourceHealthItem(source: "\(feed.name) Feed", status: "error", detail: "HTTP \(http.statusCode)"))
                        }

                        let snapshot = try JSONDecoder().decode(MarketSignalSnapshot.self, from: data)
                        let region = RegionItem(
                            id: feed.name.lowercased(),
                            name: snapshot.regionName,
                            summary: "Pressure \(snapshot.pressureState ?? "—") \(snapshot.pressureTrend ?? "→") · As of \(snapshot.asOf ?? "n/a")",
                            value: snapshot.pressureValue
                        )
                        let source = SourceHealthItem(source: "\(feed.name) Feed", status: "available", detail: feed.url.absoluteString)
                        return (region, source)
                    } catch {
                        AppLogger.network.error("Market feed fetch failed for \(feed.name)")
                        return (nil, SourceHealthItem(source: "\(feed.name) Feed", status: "error", detail: error.localizedDescription))
                    }
                }
            }

            var regions: [RegionItem] = []
            var sources: [SourceHealthItem] = []
            for await (region, source) in group {
                if let region { regions.append(region) }
                sources.append(source)
            }
            return (regions.sorted { $0.name < $1.name }, sources.sorted { $0.source < $1.source })
        }
    }

    private func mergeSourceHealth(base: [SourceHealthItem], marketSources: [SourceHealthItem]) -> [SourceHealthItem] {
        let merged = base + marketSources
        let deduped = Dictionary(grouping: merged, by: \.source).compactMap { _, values in values.last }
        return deduped.sorted { $0.source < $1.source }
    }
}

enum DashboardServiceError: LocalizedError {
    case httpStatus(Int)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .httpStatus(let status):
            return "GitHub returned HTTP \(status)."
        case .decoding:
            return "Dashboard payload format changed and could not be decoded. Showing cached snapshot where available."
        }
    }
}
