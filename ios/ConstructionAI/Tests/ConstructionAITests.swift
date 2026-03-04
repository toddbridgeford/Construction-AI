#if canImport(XCTest)
import Foundation
import XCTest
@testable import ConstructionAI

final class ConstructionAITests: XCTestCase {
    private func fixtureURL(named fileName: String) throws -> URL {
        #if SWIFT_PACKAGE
        if let packageURL = Bundle.module.url(forResource: fileName, withExtension: "json", subdirectory: "Fixtures") {
            return packageURL
        }
        #endif

        let searchBundles: [Bundle] = [Bundle.main, Bundle(for: ConstructionAITests.self)]
        for bundle in searchBundles {
            if let url = bundle.url(forResource: fileName, withExtension: "json") {
                return url
            }
            if let url = bundle.url(forResource: fileName, withExtension: "json", subdirectory: "Fixtures") {
                return url
            }
        }

        throw NSError(
            domain: "ConstructionAITests",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Missing fixture: \(fileName).json"]
        )
    }

    func testDashboardFixtureDecodes() throws {
        let url = try fixtureURL(named: "dashboard_fixture")
        let data = try Data(contentsOf: url)
        let payload = try JSONDecoder().decode(DashboardPayload.self, from: data)
        XCTAssertEqual(payload.alerts.count, 1)
        XCTAssertEqual(payload.signals.count, 1)
    }

    func testSignalFixtureDecodes() throws {
        let url = try fixtureURL(named: "signal_api_fixture")
        let data = try Data(contentsOf: url)
        let snapshot = try JSONDecoder().decode(MarketSignalSnapshot.self, from: data)
        XCTAssertEqual(snapshot.regionName, "National")
        XCTAssertEqual(snapshot.asOf, "2026-01-01")
    }

    func testSignalSnapshotPrefersHeatmapAsOf() throws {
        let json = """
        {
          "meta": {
            "run_date": "2026-01-01",
            "region": { "name": "National" }
          },
          "heatmap": {
            "as_of": "2026-02-02"
          },
          "indices": {
            "pressure_index": {
              "value": 61.2,
              "direction": "↗",
              "risk_state": "Watch"
            }
          }
        }
        """

        let data = Data(json.utf8)
        let snapshot = try JSONDecoder().decode(MarketSignalSnapshot.self, from: data)
        XCTAssertEqual(snapshot.asOf, "2026-02-02")
    }

    func testPaletteScoringPrefersPrefix() {
        let item = PaletteItem(id: "x", category: .actions, title: "Refresh dashboard", subtitle: "Fetch", symbol: "arrow.clockwise", hint: "", hintStyle: .action, keywords: ["reload"], priority: 1, action: .refresh)
        XCTAssertGreaterThan(PaletteScorer.score(item: item, query: "ref"), PaletteScorer.score(item: item, query: "dash"))
    }
}
#endif
