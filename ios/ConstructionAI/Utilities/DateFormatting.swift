import Foundation

enum DateFormatting {
    static let isoParser: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let shortDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    static func display(_ iso: String?) -> String {
        guard let iso else { return "—" }
        if let date = isoParser.date(from: iso) {
            return shortDateTime.string(from: date)
        }
        return iso
    }
}
