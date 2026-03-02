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
}
