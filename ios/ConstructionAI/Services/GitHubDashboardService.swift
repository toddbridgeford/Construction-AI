import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct GitHubDashboardService {
    func fetchDashboard() async throws -> (DashboardPayload, Date) {
        var request = URLRequest(url: Config.dashboardURL)
        request.timeoutInterval = Config.requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        let payload = try JSONDecoder().decode(DashboardPayload.self, from: data)
        return (payload, Date())
    }
}
