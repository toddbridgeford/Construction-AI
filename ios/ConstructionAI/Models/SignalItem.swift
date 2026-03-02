import Foundation

struct SignalItem: Codable, Identifiable, Hashable {
    var id: String { key }
    let key: String
    let value: Double?
    let arrow: String?
    let severityRaw: String?
    let interpretation: String?

    var severity: Severity { Severity(raw: severityRaw) }
}
