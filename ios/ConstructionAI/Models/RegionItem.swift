import Foundation

struct RegionItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let summary: String?
    let value: Double?

    enum CodingKeys: String, CodingKey {
        case id, name, summary, value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Unknown Region"
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? name
        summary = try container.decodeIfPresent(String.self, forKey: .summary)
        value = try container.decodeIfPresent(Double.self, forKey: .value)
    }
}
