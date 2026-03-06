import Foundation

struct ForecastViewModel {
    let strongest: [ForecastRankedMarket]
    let weakest: [ForecastRankedMarket]
    let headline: String
    let topStrengthTheme: String
    let topWeaknessTheme: String

    static let empty = ForecastViewModel(
        strongest: [],
        weakest: [],
        headline: "Forecast unavailable",
        topStrengthTheme: "Forecast unavailable",
        topWeaknessTheme: "Forecast unavailable"
    )
}

struct ForecastRankedMarket: Codable, Identifiable, Hashable {
    let market: String
    let forecastScore: Double
    let currentScore: Double
    let direction: String
    let drivers: [String]
    let explanation: String

    var id: String { market }

    enum CodingKeys: String, CodingKey {
        case market
        case forecastScore = "forecast_score"
        case currentScore = "current_score"
        case direction
        case drivers
        case explanation
    }
}

struct ConstructionForecastResponse: Codable {
    let forecast: ConstructionForecastPayload
}

struct ConstructionForecastPayload: Codable {
    let strongestNext12Months: [ForecastRankedMarket]
    let weakestNext12Months: [ForecastRankedMarket]
    let summary: ConstructionForecastSummary

    enum CodingKeys: String, CodingKey {
        case strongestNext12Months = "strongest_next_12_months"
        case weakestNext12Months = "weakest_next_12_months"
        case summary
    }
}

struct ConstructionForecastSummary: Codable {
    let topStrengthTheme: String
    let topWeaknessTheme: String
    let headline: String

    enum CodingKeys: String, CodingKey {
        case topStrengthTheme = "top_strength_theme"
        case topWeaknessTheme = "top_weakness_theme"
        case headline
    }
}
