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
        key = container.decodeConstructionAIString(forKey: .key) ?? "Unknown Signal"
        value = container.decodeConstructionAIDouble(forKey: .value)
        arrow = container.decodeConstructionAIString(forKey: .arrow)
        severityRaw = container.decodeConstructionAIString(forKey: .severityRaw)
        interpretation = container.decodeConstructionAIString(forKey: .interpretation)
    }
}
