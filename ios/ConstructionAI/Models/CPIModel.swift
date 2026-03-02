import Foundation

struct CPIHistoryPoint: Codable, Hashable {
    let date: String
    let value: Double
}

struct CPIModel: Codable, Hashable {
    let value: Double?
    let zone: String?
    let delta3M: Double?
    let momentum: String?
    let history: [CPIHistoryPoint]

    enum CodingKeys: String, CodingKey {
        case value = "cpi"
        case headline
        case zone
        case delta3M = "delta_3m"
        case momentum
        case history
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        value = try container.decodeIfPresent(Double.self, forKey: .value)
            ?? container.decodeIfPresent(Double.self, forKey: .headline)
        zone = try container.decodeIfPresent(String.self, forKey: .zone)
        delta3M = try container.decodeIfPresent(Double.self, forKey: .delta3M)
        momentum = try container.decodeIfPresent(String.self, forKey: .momentum)

        if let objectHistory = try container.decodeIfPresent([CPIHistoryPoint].self, forKey: .history) {
            history = objectHistory
        } else if let numericHistory = try container.decodeIfPresent([Double].self, forKey: .history) {
            history = numericHistory.enumerated().map { index, value in
                CPIHistoryPoint(date: "legacy_\(index)", value: value)
            }
        } else {
            history = []
        }
    }


    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(value, forKey: .value)
        try container.encodeIfPresent(zone, forKey: .zone)
        try container.encodeIfPresent(delta3M, forKey: .delta3M)
        try container.encodeIfPresent(momentum, forKey: .momentum)
        try container.encode(history, forKey: .history)
    }
}
