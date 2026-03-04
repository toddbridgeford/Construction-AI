import Foundation

enum RuntimeConfig {
    private enum Keys {
        static let dashboardURL = "runtime.dashboardURL"
        static let marketFeeds = "runtime.marketFeeds"
    }

    static var dashboardURL: URL {
        if let value = UserDefaults.standard.string(forKey: Keys.dashboardURL),
           let url = URL(string: value),
           !value.isEmpty {
            return url
        }
        return Config.dashboardURL
    }

    static var marketSignalFeeds: [MarketFeed] {
        guard let raw = UserDefaults.standard.array(forKey: Keys.marketFeeds) as? [[String: String]] else {
            return Config.marketSignalFeeds
        }

        let feeds = raw.compactMap { row -> MarketFeed? in
            guard let name = row["name"], let urlValue = row["url"], let url = URL(string: urlValue) else {
                return nil
            }
            return MarketFeed(name: name, url: url)
        }
        return feeds.isEmpty ? Config.marketSignalFeeds : feeds
    }
}
