import Foundation

enum Severity: String, Codable, CaseIterable {
    case watch = "WATCH"
    case monitor = "MONITOR"
    case normal = "NORMAL"
    case critical = "CRITICAL"
    case unknown = "UNKNOWN"

    init(raw: String?) {
        self = Severity(rawValue: raw?.uppercased() ?? "") ?? .unknown
    }
}

struct AlertItem: Codable, Identifiable, Hashable {
    var id: String { "\(title)-\(message)" }
    let severityRaw: String?
    let symbol: String?
    let title: String
    let message: String

    var severity: Severity { Severity(raw: severityRaw) }

    enum CodingKeys: String, CodingKey {
        case severityRaw = "severity"
        case symbol, title, message
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        severityRaw = try container.decodeIfPresent(String.self, forKey: .severityRaw)
        symbol = try container.decodeIfPresent(String.self, forKey: .symbol)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled Alert"
        message = try container.decodeIfPresent(String.self, forKey: .message) ?? "No alert details provided."
    }
}
