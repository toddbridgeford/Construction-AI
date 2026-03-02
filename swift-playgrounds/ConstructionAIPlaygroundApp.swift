import SwiftUI
import Foundation

@main
struct ConstructionAIPlaygroundApp: App {
    @StateObject private var viewModel = DashboardViewModel()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                DashboardView(viewModel: viewModel)
            }
            .task {
                await viewModel.bootstrap()
            }
        }
    }
}

struct DashboardView: View {
    @ObservedObject var viewModel: DashboardViewModel

    var body: some View {
        List {
            Section("Connection") {
                HStack {
                    Label("Status", systemImage: viewModel.connectionBanner.icon)
                    Spacer()
                    Text(viewModel.connectionBanner.message)
                        .foregroundStyle(viewModel.connectionBanner.color)
                        .multilineTextAlignment(.trailing)
                }
                .accessibilityElement(children: .combine)
            }

            Section("Dashboard") {
                metricRow(title: "Headline CPI", value: viewModel.dashboard.cpiHeadline.map { String(format: "%.2f", $0) } ?? "—")
                metricRow(title: "Construction News", value: "\(viewModel.dashboard.newsCount)")
                metricRow(title: "Tracked Tickers", value: "\(viewModel.dashboard.tickerCount)")
                metricRow(title: "Last Updated", value: viewModel.dashboard.lastUpdated ?? "Unknown")
            }

            Section("Notion") {
                TextField("Notion token (optional)", text: $viewModel.notionToken)
                    .textContentType(.password)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)

                TextField("Notion database ID (optional)", text: $viewModel.notionDatabaseID)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)

                Button("Refresh From Notion") {
                    Task {
                        await viewModel.refreshFromNotion()
                    }
                }
                .buttonStyle(.borderedProminent)

                if !viewModel.latestNotionError.isEmpty {
                    Text(viewModel.latestNotionError)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Construction AI")
        .refreshable {
            await viewModel.refreshFromNotion()
        }
    }

    private func metricRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }
}

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var notionToken: String = ""
    @Published var notionDatabaseID: String = ""
    @Published var dashboard: ConstructionDashboard = .empty
    @Published var latestNotionError: String = ""
    @Published var connectionBanner: ConnectionBanner = .idle

    private let cache = DashboardCache()
    private let notionClient = NotionClient()

    func bootstrap() async {
        dashboard = cache.read() ?? .sample
        connectionBanner = .idle
    }

    func refreshFromNotion() async {
        latestNotionError = ""

        guard !notionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !notionDatabaseID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            connectionBanner = .warning("Using cached data (Notion not configured)")
            return
        }

        connectionBanner = .loading

        do {
            let remoteDashboard = try await notionClient.fetchDashboard(token: notionToken, databaseID: notionDatabaseID)
            dashboard = remoteDashboard
            cache.write(remoteDashboard)
            connectionBanner = .success("Live data loaded")
        } catch {
            latestNotionError = "Notion sync failed: \(error.localizedDescription)"
            connectionBanner = .warning("Fell back to cached data")
            dashboard = cache.read() ?? dashboard
        }
    }
}

struct ConstructionDashboard: Codable {
    var cpiHeadline: Double?
    var newsCount: Int
    var tickerCount: Int
    var lastUpdated: String?

    static let empty = ConstructionDashboard(cpiHeadline: nil, newsCount: 0, tickerCount: 0, lastUpdated: nil)
    static let sample = ConstructionDashboard(cpiHeadline: 3.4, newsCount: 12, tickerCount: 20, lastUpdated: ISO8601DateFormatter().string(from: .now))
}

final class DashboardCache {
    private let key = "construction-ai-dashboard-cache"

    func write(_ dashboard: ConstructionDashboard) {
        guard let data = try? JSONEncoder().encode(dashboard) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    func read() -> ConstructionDashboard? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(ConstructionDashboard.self, from: data)
    }
}

struct NotionClient {
    enum ClientError: LocalizedError {
        case badURL
        case badResponse
        case decodingFallback

        var errorDescription: String? {
            switch self {
            case .badURL: return "Invalid Notion request URL."
            case .badResponse: return "Notion returned an invalid response."
            case .decodingFallback: return "Notion payload did not contain expected fields."
            }
        }
    }

    func fetchDashboard(token: String, databaseID: String) async throws -> ConstructionDashboard {
        guard let url = URL(string: "https://api.notion.com/v1/databases/\(databaseID)/query") else {
            throw ClientError.badURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("2022-06-28", forHTTPHeaderField: "Notion-Version")
        request.httpBody = Data("{}".utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ClientError.badResponse
        }

        return parseDashboard(from: data)
    }

    private func parseDashboard(from data: Data) -> ConstructionDashboard {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let results = object["results"] as? [[String: Any]],
            let first = results.first,
            let properties = first["properties"] as? [String: Any]
        else {
            return .sample
        }

        let cpi = extractNumber(properties["CPIHeadline"])
        let news = Int(extractNumber(properties["NewsCount"]))
        let tickers = Int(extractNumber(properties["TickerCount"]))
        let updated = extractText(properties["LastUpdated"])

        return ConstructionDashboard(
            cpiHeadline: cpi,
            newsCount: news,
            tickerCount: tickers,
            lastUpdated: updated
        )
    }

    private func extractNumber(_ property: Any?) -> Double {
        guard
            let property = property as? [String: Any],
            let number = property["number"] as? Double
        else {
            return 0
        }
        return number
    }

    private func extractText(_ property: Any?) -> String {
        guard
            let property = property as? [String: Any],
            let richText = property["rich_text"] as? [[String: Any]],
            let first = richText.first,
            let plain = first["plain_text"] as? String
        else {
            return ISO8601DateFormatter().string(from: .now)
        }
        return plain
    }
}

struct ConnectionBanner {
    let message: String
    let color: Color
    let icon: String

    static let idle = ConnectionBanner(message: "Cached", color: .secondary, icon: "externaldrive")
    static let loading = ConnectionBanner(message: "Syncing…", color: .blue, icon: "arrow.triangle.2.circlepath")
    static func success(_ text: String) -> ConnectionBanner {
        ConnectionBanner(message: text, color: .green, icon: "checkmark.circle")
    }

    static func warning(_ text: String) -> ConnectionBanner {
        ConnectionBanner(message: text, color: .orange, icon: "exclamationmark.triangle")
    }
}
