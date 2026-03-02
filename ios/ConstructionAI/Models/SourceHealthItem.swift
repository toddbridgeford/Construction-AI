import Foundation

struct SourceHealthItem: Codable, Identifiable, Hashable {
    var id: String { source }
    let source: String
    let status: String
    let detail: String?
}
