import XCTest
@testable import ConstructionAI

final class ConstructionAITests: XCTestCase {
    func testDashboardFixtureDecodes() throws {
        let url = Bundle.module.url(forResource: "dashboard_fixture", withExtension: "json", subdirectory: "Fixtures")!
        let data = try Data(contentsOf: url)
        let payload = try JSONDecoder().decode(DashboardPayload.self, from: data)
        XCTAssertEqual(payload.alerts.count, 1)
        XCTAssertEqual(payload.signals.count, 1)
    }

    func testSignalFixtureDecodes() throws {
        let url = Bundle.module.url(forResource: "signal_api_fixture", withExtension: "json", subdirectory: "Fixtures")!
        let data = try Data(contentsOf: url)
        let snapshot = try JSONDecoder().decode(MarketSignalSnapshot.self, from: data)
        XCTAssertEqual(snapshot.regionName, "National")
    }

    func testPaletteScoringPrefersPrefix() {
        let item = PaletteItem(id: "x", category: .actions, title: "Refresh dashboard", subtitle: "Fetch", symbol: "arrow.clockwise", hint: "", hintStyle: .action, keywords: ["reload"], priority: 1, action: .refresh)
        XCTAssertGreaterThan(PaletteScorer.score(item: item, query: "ref"), PaletteScorer.score(item: item, query: "dash"))
    }
}
