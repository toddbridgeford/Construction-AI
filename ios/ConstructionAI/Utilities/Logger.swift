import Foundation
import os

private let subsystem = "com.constructionai.terminal"

enum AppLogger {
    static let network = Logger(subsystem: subsystem, category: "network")
    static let cache = Logger(subsystem: subsystem, category: "cache")
    static let ui = Logger(subsystem: subsystem, category: "ui")
    static let lifecycle = Logger(subsystem: subsystem, category: "lifecycle")
}

enum Signpost {
    private static let log = OSLog(subsystem: subsystem, category: .pointsOfInterest)

    static func begin(_ name: StaticString, id: OSSignpostID = .exclusive) -> OSSignpostID {
        let signpostID = id == .exclusive ? OSSignpostID(log: log) : id
        os_signpost(.begin, log: log, name: name, signpostID: signpostID)
        return signpostID
    }

    static func end(_ name: StaticString, id: OSSignpostID) {
        os_signpost(.end, log: log, name: name, signpostID: id)
    }
}
