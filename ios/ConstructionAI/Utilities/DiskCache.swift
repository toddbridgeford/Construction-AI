import Foundation

enum DiskCache {
    private static var fileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent(Config.appSupportFolder, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("dashboard_cache.json")
    }

    static func save(_ payload: DashboardPayload) {
        do {
            let data = try JSONEncoder().encode(payload)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            Logging.log("Cache save failed: \(error.localizedDescription)")
        }
    }

    static func load() -> DashboardPayload? {
        do {
            let data = try Data(contentsOf: fileURL)
            return try JSONDecoder().decode(DashboardPayload.self, from: data)
        } catch {
            Logging.log("Cache load failed: \(error.localizedDescription)")
            return nil
        }
    }

    static func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
