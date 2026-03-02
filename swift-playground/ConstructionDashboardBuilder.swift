import Foundation
import FoundationNetworking
import Dispatch

// Swift Playground-compatible rewrite of scripts/build_dashboard_latest.mjs.
// This version focuses on the core pipeline structure, safe fetch/parse behavior,
// and JSON dashboard assembly while remaining runnable in Playground or Swift CLI.

// MARK: - Utilities

enum DashboardError: Error {
    case missingEnvironmentVariable(String)
    case invalidURL(String)
}

func mustGetEnv(_ name: String) throws -> String {
    if let value = ProcessInfo.processInfo.environment[name], !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return value
    }
    throw DashboardError.missingEnvironmentVariable(name)
}

func getEnv(_ name: String, fallback: String? = nil) -> String? {
    guard let value = ProcessInfo.processInfo.environment[name]?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
        return fallback
    }
    return value
}

func safeNumber(_ raw: Any?) -> Double? {
    guard let raw else { return nil }

    if let number = raw as? NSNumber {
        return number.doubleValue.isFinite ? number.doubleValue : nil
    }

    let stringValue = String(describing: raw).replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard let parsed = Double(stringValue), parsed.isFinite else { return nil }
    return parsed
}

func clamp(_ x: Double, min lo: Double = 0, max hi: Double = 100) -> Double {
    return max(lo, min(hi, x))
}

func isoUtcNow() -> String {
    ISO8601DateFormatter().string(from: Date())
}

func todayISODate() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

func parseCsvEnvList(_ value: String?) -> [String] {
    (value ?? "")
        .split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
}

func trendArrow(current: Double?, previous: Double?, epsilon: Double = 1e-9) -> String {
    guard let current, let previous else { return "→" }
    if abs(current - previous) <= epsilon { return "→" }
    return current > previous ? "↑" : "↓"
}

func symbolForTrend(_ arrow: String) -> String {
    switch arrow {
    case "↑": return "arrow.up.right"
    case "↓": return "arrow.down.right"
    default: return "arrow.right"
    }
}

func normalizeUrl(_ raw: String) -> String {
    guard var components = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)) else {
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    components.fragment = nil

    if let queryItems = components.queryItems {
        let drop = Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "fbclid"])
        components.queryItems = queryItems.filter { !drop.contains($0.name.lowercased()) }
    }

    return components.url?.absoluteString ?? raw.trimmingCharacters(in: .whitespacesAndNewlines)
}

// MARK: - Networking

struct HTTP {
    static let defaultHeaders: [String: String] = [
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive"
    ]

    static func fetchData(_ urlString: String, headers: [String: String] = [:]) async throws -> Data {
        guard let url = URL(string: urlString) else { throw DashboardError.invalidURL(urlString) }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        for (key, value) in defaultHeaders.merging(headers, uniquingKeysWith: { _, new in new }) {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw NSError(domain: "HTTPError", code: status, userInfo: [NSLocalizedDescriptionKey: "Fetch failed \(status) for \(urlString)"])
        }

        return data
    }

    static func fetchJSON(_ urlString: String, headers: [String: String] = [:]) async throws -> Any {
        let data = try await fetchData(urlString, headers: headers)
        return try JSONSerialization.jsonObject(with: data)
    }
}

// MARK: - FRED support (safe)

struct FredObservation: Codable {
    let date: String
    let value: String
}

struct FredObservationsResponse: Codable {
    let observations: [FredObservation]
}

struct FredSeriesResult {
    let seriesID: String
    let ok: Bool
    let latest: (date: String, value: Double?)?
    let history: [(date: String, value: Double?)]
    let error: String?
}

func fredObservations(apiKey: String, seriesID: String, limit: Int = 48, observationStart: String? = nil) async throws -> [(date: String, value: Double?)] {
    var components = URLComponents(string: "https://api.stlouisfed.org/fred/series/observations")!
    components.queryItems = [
        URLQueryItem(name: "api_key", value: apiKey),
        URLQueryItem(name: "file_type", value: "json"),
        URLQueryItem(name: "series_id", value: seriesID),
        URLQueryItem(name: "sort_order", value: "desc"),
        URLQueryItem(name: "limit", value: String(limit))
    ]

    if let observationStart {
        components.queryItems?.append(URLQueryItem(name: "observation_start", value: observationStart))
    }

    guard let url = components.url else { throw DashboardError.invalidURL("FRED observations") }
    let data = try await HTTP.fetchData(url.absoluteString)
    let decoded = try JSONDecoder().decode(FredObservationsResponse.self, from: data)

    return decoded.observations.map { item in
        (date: item.date, value: safeNumber(item.value))
    }
}

func fredSeriesSafe(apiKey: String, seriesID: String, limit: Int = 48) async -> FredSeriesResult {
    do {
        let observations = try await fredObservations(apiKey: apiKey, seriesID: seriesID, limit: limit, observationStart: getEnv("FRED_OBSERVATION_START"))
        let latest = observations.first
        return FredSeriesResult(
            seriesID: seriesID,
            ok: true,
            latest: latest,
            history: observations.reversed(),
            error: nil
        )
    } catch {
        return FredSeriesResult(
            seriesID: seriesID,
            ok: false,
            latest: nil,
            history: [],
            error: String(describing: error)
        )
    }
}

func latestValue(_ series: FredSeriesResult?) -> Double? {
    return series?.latest?.value
}

func previousValue(_ series: FredSeriesResult?, stepsBack: Int = 1) -> Double? {
    guard let history = series?.history, history.count > stepsBack else { return nil }
    let index = history.count - 1 - stepsBack
    guard index >= 0 else { return nil }
    return history[index].value
}

func averageLastN(_ history: [(date: String, value: Double?)], count n: Int, excludingLast excludeLast: Int = 0) -> Double? {
    guard !history.isEmpty, n > 0 else { return nil }
    let end = history.count - excludeLast
    let start = max(0, end - n)
    guard start < end else { return nil }

    let values = history[start..<end].compactMap { $0.value }
    guard !values.isEmpty else { return nil }
    return values.reduce(0, +) / Double(values.count)
}

// MARK: - Config loading helpers

func readJSONFile(at path: String) throws -> Any {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    return try JSONSerialization.jsonObject(with: data)
}

func resolveRepositoryRoot() -> String {
    FileManager.default.currentDirectoryPath
}

// MARK: - Dashboard assembly

func buildDashboard() async throws -> [String: Any] {
    let root = resolveRepositoryRoot()

    let fredSignalsPath = root + "/config/fred_signals.json"
    let publicMarketUniversePath = root + "/config/public_market_universe.json"
    let marketSnapshotPath = root + "/config/public_market_snapshot.json"

    let fredSignalJSON = try readJSONFile(at: fredSignalsPath)
    let universeJSON = try readJSONFile(at: publicMarketUniversePath)
    let marketSnapshotJSON = try readJSONFile(at: marketSnapshotPath)

    let fredAPIKey = try? mustGetEnv("FRED_API_KEY")
    let seriesIDs = parseCsvEnvList(getEnv("FRED_SERIES_IDS", fallback: nil))

    var fredSeriesPayload: [[String: Any]] = []

    if let fredAPIKey, !seriesIDs.isEmpty {
        for seriesID in seriesIDs {
            let result = await fredSeriesSafe(apiKey: fredAPIKey, seriesID: seriesID)
            let curr = latestValue(result)
            let prev = previousValue(result)
            let arrow = trendArrow(current: curr, previous: prev)

            fredSeriesPayload.append([
                "series_id": result.seriesID,
                "ok": result.ok,
                "latest": ["date": result.latest?.date as Any, "value": curr as Any],
                "previous": prev as Any,
                "trend_arrow": arrow,
                "trend_symbol": symbolForTrend(arrow),
                "avg_last_6": averageLastN(result.history, count: 6) as Any,
                "error": result.error as Any
            ])
        }
    }

    return [
        "generated_at": isoUtcNow(),
        "as_of": todayISODate(),
        "source": "swift-playground",
        "inputs": [
            "fred_signals": fredSignalJSON,
            "public_market_universe": universeJSON,
            "public_market_snapshot": marketSnapshotJSON
        ],
        "fred_series": fredSeriesPayload,
        "meta": [
            "note": "Swift Playground rewrite of the original JavaScript dashboard builder.",
            "url_normalizer_example": normalizeUrl("https://example.com/page?utm_source=x&id=1#section"),
            "capital_score_demo": clamp(112.4)
        ]
    ]
}

func writeDashboard(_ dashboard: [String: Any], outPath: String) throws {
    let data = try JSONSerialization.data(withJSONObject: dashboard, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: URL(fileURLWithPath: outPath))
}

// MARK: - Entry point (works in Swift CLI and Playground)

let semaphore = DispatchSemaphore(value: 0)
Task {
    defer { semaphore.signal() }
    do {
        let root = resolveRepositoryRoot()
        let outputPath = getEnv("OUT_PATH", fallback: root + "/dashboard_latest_swift.json") ?? (root + "/dashboard_latest_swift.json")

        let dashboard = try await buildDashboard()
        try writeDashboard(dashboard, outPath: outputPath)

        print("✅ Dashboard written to \(outputPath)")
    } catch {
        print("❌ Failed to build dashboard: \(error)")
    }
}
_ = semaphore.wait(timeout: .distantFuture)
