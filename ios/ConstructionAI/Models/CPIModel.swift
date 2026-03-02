import Foundation

struct CPIModel: Codable, Hashable {
    let value: Double?
    let zone: String?
    let delta3M: Double?
    let momentum: String?
    let history: [Double]

    enum CodingKeys: String, CodingKey {
        case value = "cpi"
        case zone
        case delta3M = "delta_3m"
        case momentum
        case history
    }
}
