import Foundation

struct CPIHistoryPoint: Codable, Hashable {
    let date: String
    let value: Double

    enum CodingKeys: String, CodingKey {
        case date, value
    }

    init(date: String, value: Double) {
        self.date = date
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        date = container.decodeLossyString(forKey: .date) ?? "unknown"
        value = container.decodeLossyDouble(forKey: .value) ?? 0
    }
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
        value = container.decodeLossyDouble(forKey: .value)
            ?? container.decodeLossyDouble(forKey: .headline)
        zone = container.decodeLossyString(forKey: .zone)
        delta3M = container.decodeLossyDouble(forKey: .delta3M)
        momentum = container.decodeLossyString(forKey: .momentum)

        if let objectHistory = try? container.decode([CPIHistoryPoint].self, forKey: .history) {
            history = objectHistory
        } else if let numericHistory = try? container.decode([Double].self, forKey: .history) {
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
