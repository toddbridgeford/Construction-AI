import Foundation

struct RegionItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let summary: String?
    let value: Double?

    enum CodingKeys: String, CodingKey { case id, name, summary, value }

    init(id: String, name: String, summary: String?, value: Double?) {
        self.id = id
        self.name = name
        self.summary = summary
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = container.decodeConstructionAIString(forKey: .name) ?? "Unknown Region"
        id = container.decodeConstructionAIString(forKey: .id) ?? name
        summary = container.decodeConstructionAIString(forKey: .summary)
        value = container.decodeConstructionAIDouble(forKey: .value)
    }
}
