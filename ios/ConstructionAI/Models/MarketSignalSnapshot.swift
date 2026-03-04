import Foundation

struct MarketSignalSnapshot: Decodable, Hashable {
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

        let meta = try? container.nestedContainer(keyedBy: MetaKeys.self, forKey: .meta)
        if let meta,
           let region = try? meta.nestedContainer(keyedBy: RegionKeys.self, forKey: .region) {
            regionName = region.decodeConstructionAIString(forKey: .name) ?? "Unknown"
        } else {
            regionName = "Unknown"
        }

        let runDate = meta?.decodeConstructionAIString(forKey: .runDate)
        if let heatmap = try? container.nestedContainer(keyedBy: HeatmapKeys.self, forKey: .heatmap) {
            asOf = heatmap.decodeConstructionAIString(forKey: .asOf) ?? runDate
        } else {
            asOf = runDate
        }

        if let indices = try? container.nestedContainer(keyedBy: IndicesKeys.self, forKey: .indices),
           let pressure = try? indices.nestedContainer(keyedBy: PressureKeys.self, forKey: .pressureIndex) {
            pressureValue = pressure.decodeConstructionAIDouble(forKey: .value)
            pressureTrend = pressure.decodeConstructionAIString(forKey: .direction)
            pressureState = pressure.decodeConstructionAIString(forKey: .riskState)
        } else {
            pressureValue = nil
            pressureTrend = nil
            pressureState = nil
        }
    }
}
