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
        key = container.decodeLossyString(forKey: .key) ?? "Unknown Signal"
        value = container.decodeLossyDouble(forKey: .value)
        arrow = container.decodeLossyString(forKey: .arrow)
        severityRaw = container.decodeLossyString(forKey: .severityRaw)
        interpretation = container.decodeLossyString(forKey: .interpretation)
    }
}
