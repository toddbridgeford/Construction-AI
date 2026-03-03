import Foundation

struct SignalItem: Codable, Identifiable, Hashable {
    var id: String { key }
    let key: String
    let value: Double?
    let arrow: String?
    let severityRaw: String?
    let interpretation: String?

    var severity: Severity { Severity(raw: severityRaw) }

    enum CodingKeys: String, CodingKey {
        case key, value, arrow, interpretation
        case severityRaw = "severity"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decodeIfPresent(String.self, forKey: .key) ?? "Unknown Signal"
        value = try container.decodeIfPresent(Double.self, forKey: .value)
        arrow = try container.decodeIfPresent(String.self, forKey: .arrow)
        severityRaw = try container.decodeIfPresent(String.self, forKey: .severityRaw)
        interpretation = try container.decodeIfPresent(String.self, forKey: .interpretation)
    }
}
