import Foundation

enum Logging {
    static func log(_ message: String) {
        #if DEBUG
        print("[ConstructionAI] \(message)")
        #endif
    }
}
