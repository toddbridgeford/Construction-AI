import Foundation

struct DashboardPayload: Codable {
    let schemaVersion: String?
    let generatedAt: String?
    let executiveHeadline: String?
    let executiveSummary: String?
    let alerts: [AlertItem]
    let cpi: CPIModel?
    let cards: [CardItem]
    let signals: [SignalItem]
    let sources: [SourceHealthItem]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case generatedAt = "generated_at"
        case executive
        case cpi
        case ui
        case gptPayload = "gpt_payload"
        case observed
        case signals
    }

    enum ExecutiveKeys: String, CodingKey { case headline, summary }
    enum UIKeys: String, CodingKey { case alerts, cards }
    enum ObservedKeys: String, CodingKey { case sources }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = container.decodeConstructionAIString(forKey: .schemaVersion)
        generatedAt = container.decodeConstructionAIString(forKey: .generatedAt)

        if let executive = try? container.nestedContainer(keyedBy: ExecutiveKeys.self, forKey: .executive) {
            executiveHeadline = executive.decodeConstructionAIString(forKey: .headline)
            executiveSummary = executive.decodeConstructionAIString(forKey: .summary)
        } else {
            executiveHeadline = nil
            executiveSummary = nil
        }

        cpi = try container.decodeIfPresent(CPIModel.self, forKey: .cpi)

        if let ui = try? container.nestedContainer(keyedBy: UIKeys.self, forKey: .ui) {
            alerts = (try? ui.decode([AlertItem].self, forKey: .alerts)) ?? []
            cards = (try? ui.decode([CardItem].self, forKey: .cards)) ?? []
        } else {
            alerts = []
            cards = []
        }

        if let gptPayload = try? container.decode(GPTPayload.self, forKey: .gptPayload),
           let signalStrip = gptPayload.signalStrip,
           !signalStrip.isEmpty {
            signals = signalStrip
        } else if let directSignals = try? container.decode([SignalItem].self, forKey: .signals) {
            signals = directSignals
        } else {
            signals = []
        }

        if let observed = try? container.nestedContainer(keyedBy: ObservedKeys.self, forKey: .observed),
           let sourcesObject = try? observed.decode([String: SourceDescriptor].self, forKey: .sources) {
            sources = sourcesObject.map {
                SourceHealthItem(source: $0.key, status: "available", detail: $0.value.description)
            }.sorted { $0.source < $1.source }
        } else {
            sources = []
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(schemaVersion, forKey: .schemaVersion)
        try container.encodeIfPresent(generatedAt, forKey: .generatedAt)
        try container.encodeIfPresent(cpi, forKey: .cpi)

        if executiveHeadline != nil || executiveSummary != nil {
            var executive = container.nestedContainer(keyedBy: ExecutiveKeys.self, forKey: .executive)
            try executive.encodeIfPresent(executiveHeadline, forKey: .headline)
            try executive.encodeIfPresent(executiveSummary, forKey: .summary)
        }

        var ui = container.nestedContainer(keyedBy: UIKeys.self, forKey: .ui)
        try ui.encode(alerts, forKey: .alerts)
        try ui.encode(cards, forKey: .cards)

        let payload = GPTPayload(signalStrip: signals)
        try container.encode(payload, forKey: .gptPayload)

        if !sources.isEmpty {
            var observed = container.nestedContainer(keyedBy: ObservedKeys.self, forKey: .observed)
            let sourceMap = Dictionary(uniqueKeysWithValues: sources.map { source in
                (
                    source.source,
                    SourceDescriptor(api: nil, base: nil, statePage: source.detail)
                )
            })
            try observed.encode(sourceMap, forKey: .sources)
        }
    }
}

struct CardItem: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String?
    let value: Double?
    let trend: String?
    let symbol: String?
    let severityRaw: String?

    var severity: Severity { Severity(raw: severityRaw) }

    enum CodingKeys: String, CodingKey {
        case id, title, subtitle, value, trend, symbol
        case severityRaw = "severity"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = container.decodeConstructionAIString(forKey: .title) ?? "Untitled Card"
        id = container.decodeConstructionAIString(forKey: .id) ?? title
        subtitle = container.decodeConstructionAIString(forKey: .subtitle)
        value = container.decodeConstructionAIDouble(forKey: .value)
        trend = container.decodeConstructionAIString(forKey: .trend)
        symbol = container.decodeConstructionAIString(forKey: .symbol)
        severityRaw = container.decodeConstructionAIString(forKey: .severityRaw)
    }
}

private struct GPTPayload: Codable {
    let signalStrip: [SignalItem]?

    enum CodingKeys: String, CodingKey {
        case signalStrip = "signal_strip"
    }
}

private struct SourceDescriptor: Codable {
    let api: String?
    let base: String?
    let statePage: String?

    enum CodingKeys: String, CodingKey {
        case api, base
        case statePage = "state_page"
    }

    var description: String {
        api ?? base ?? statePage ?? "Source metadata available"
    }
}
