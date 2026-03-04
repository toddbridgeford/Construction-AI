import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct GitHubDashboardService {
    func fetchDashboard() async throws -> (DashboardPayload, Date) {
        var request = URLRequest(url: Config.dashboardURL)
        request.timeoutInterval = Config.requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData

        if let token = Config.githubToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            Logging.log("GitHub token detected. Authenticated dashboard fetch enabled.")
        } else {
            Logging.log("No GitHub token configured. Falling back to unauthenticated dashboard fetch.")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        guard http.statusCode == 200 else {
            let bodyMessage = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let bodyMessage, !bodyMessage.isEmpty {
                Logging.log("Dashboard fetch failed with HTTP status \(http.statusCode): \(bodyMessage)")
            } else {
                Logging.log("Dashboard fetch failed with HTTP status \(http.statusCode).")
            }
            throw DashboardServiceError.httpStatus(http.statusCode)
        }

        do {
            let payload = try JSONDecoder().decode(DashboardPayload.self, from: data)
            return (payload, Date())
        } catch {
            Logging.log("Dashboard decode failed: \(error.localizedDescription)")
            throw DashboardServiceError.decoding(error)
        }
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
            return "Dashboard payload format changed and could not be decoded."
        }
    }
}
