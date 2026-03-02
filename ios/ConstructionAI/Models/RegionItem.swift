import Foundation

struct RegionItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let summary: String?
    let value: Double?
}
