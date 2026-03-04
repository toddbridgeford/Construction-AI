import Foundation

struct MarketSignalSnapshot: Decodable {
    let regionName: String
    let pressureValue: Double?
    let pressureTrend: String?
    let pressureState: String?
    let asOf: String?

    enum CodingKeys: String, CodingKey {
        case meta
        case indices
        case heatmap
    }

    enum MetaKeys: String, CodingKey {
        case runDate = "run_date"
        case region
    }

    enum RegionKeys: String, CodingKey {
        case name
    }

    enum IndicesKeys: String, CodingKey {
        case pressureIndex = "pressure_index"
    }

    enum PressureKeys: String, CodingKey {
        case value
        case direction
        case riskState = "risk_state"
    }

    enum HeatmapKeys: String, CodingKey {
        case asOf = "as_of"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        if let meta = try? container.nestedContainer(keyedBy: MetaKeys.self, forKey: .meta),
           let region = try? meta.nestedContainer(keyedBy: RegionKeys.self, forKey: .region) {
            regionName = region.decodeLossyString(forKey: .name) ?? "Unknown"
            asOf = meta.decodeLossyString(forKey: .runDate)
        } else {
            regionName = "Unknown"
            asOf = nil
        }

        if let indices = try? container.nestedContainer(keyedBy: IndicesKeys.self, forKey: .indices),
           let pressure = try? indices.nestedContainer(keyedBy: PressureKeys.self, forKey: .pressureIndex) {
            pressureValue = pressure.decodeLossyDouble(forKey: .value)
            pressureTrend = pressure.decodeLossyString(forKey: .direction)
            pressureState = pressure.decodeLossyString(forKey: .riskState)
        } else {
            pressureValue = nil
            pressureTrend = nil
            pressureState = nil
        }
    }
}
