import Foundation

enum Config {
    static let dashboardURL = URL(string: "https://raw.githubusercontent.com/toddbridgeford/Construction-AI/Predictive-Model/dashboard_latest.json")!
    static let requestTimeout: TimeInterval = 20
    static let appSupportFolder = "ConstructionAI"

    static let marketSignalFeeds: [MarketFeed] = [
        .init(name: "National", url: URL(string: "https://raw.githubusercontent.com/toddbridgeford/Construction-AI/main/dist/markets/national/signal_api_latest.json")!),
        .init(name: "Denver", url: URL(string: "https://raw.githubusercontent.com/toddbridgeford/Construction-AI/main/dist/markets/denver/signal_api_latest.json")!),
        .init(name: "Phoenix", url: URL(string: "https://raw.githubusercontent.com/toddbridgeford/Construction-AI/main/dist/markets/phoenix/signal_api_latest.json")!)
    ]

    // Keys can be injected from Info.plist, environment variables, or UserDefaults.
    // This keeps Swift Playgrounds usage simple while still supporting secure CI/runtime injection.
    static let githubTokenInfoPlistKeys = ["GITHUB_TOKEN", "CONSTRUCTION_AI_GITHUB_TOKEN"]
    static let githubTokenEnvironmentKeys = ["GITHUB_TOKEN", "CONSTRUCTION_AI_GITHUB_TOKEN"]
    static let githubTokenUserDefaultsKeys = ["githubToken", "GITHUB_TOKEN", "construction_ai_github_token"]

    static var githubToken: String? {
        firstNonEmptyValue(for: githubTokenUserDefaultsKeys, in: UserDefaults.standard.string(forKey:))
            ?? firstNonEmptyValue(for: githubTokenEnvironmentKeys, in: { ProcessInfo.processInfo.environment[$0] })
            ?? firstNonEmptyValue(for: githubTokenInfoPlistKeys, in: { Bundle.main.object(forInfoDictionaryKey: $0) as? String })
    }

    static var isGitHubTokenConfigured: Bool {
        githubToken != nil
    }

    private static func firstNonEmptyValue(for keys: [String], in resolver: (String) -> String?) -> String? {
        for key in keys {
            guard let value = resolver(key)?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
                continue
            }
            return value
        }
        return nil
    }
}

struct MarketFeed: Hashable {
    let name: String
    let url: URL
}
