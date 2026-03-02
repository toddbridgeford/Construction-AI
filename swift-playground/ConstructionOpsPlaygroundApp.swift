import SwiftUI
import Foundation
import WebKit

// MARK: - App Entry

@main
struct ConstructionOpsPlaygroundApp: App {
    var body: some Scene {
        WindowGroup {
            DashboardRootView()
        }
    }
}

// MARK: - Models

struct AppSettings: Codable {
    var githubOwner: String = ""
    var githubRepo: String = ""
    var githubWorkflowFile: String = ""
    var githubToken: String = ""

    var notionDatabaseID: String = ""
    var notionToken: String = ""

    var openAIModel: String = "gpt-4o-mini"
    var openAIKey: String = ""

    static let storageKey = "construction.ops.settings.v1"
}

struct StatusBanner: Identifiable {
    enum Kind { case info, success, warning, error }
    let id = UUID()
    let kind: Kind
    let message: String
}

struct OpsMetric: Identifiable, Codable {
    let id: String
    let title: String
    let value: String
    let subtitle: String
}

struct OpsLog: Identifiable, Codable {
    let id: UUID
    let timestamp: Date
    let source: String
    let message: String

    init(id: UUID = UUID(), timestamp: Date = Date(), source: String, message: String) {
        self.id = id
        self.timestamp = timestamp
        self.source = source
        self.message = message
    }
}

struct GitHubWorkflowRun: Identifiable, Codable {
    let id: Int
    let status: String
    let conclusion: String?
    let htmlURL: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case conclusion
        case htmlURL = "html_url"
        case createdAt = "created_at"
    }
}

struct NotionPageSummary: Identifiable, Codable {
    let id: String
    let lastEditedTime: String
    let title: String

    enum CodingKeys: String, CodingKey {
        case id
        case lastEditedTime = "last_edited_time"
        case properties
    }

    enum PropertyKeys: String, CodingKey {
        case title
        case Name
    }

    struct RichTextTitle: Codable {
        let plainText: String

        enum CodingKeys: String, CodingKey {
            case plainText = "plain_text"
        }
    }

    struct NotionTitleProperty: Codable {
        let type: String
        let title: [RichTextTitle]
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        lastEditedTime = try container.decodeIfPresent(String.self, forKey: .lastEditedTime) ?? ""

        let props = try? container.nestedContainer(keyedBy: PropertyKeys.self, forKey: .properties)
        let maybeTitleProperty = (try? props?.decode(NotionTitleProperty.self, forKey: .title))
            ?? (try? props?.decode(NotionTitleProperty.self, forKey: .Name))
        title = maybeTitleProperty?.title.first?.plainText ?? "Untitled"
    }

    init(id: String, lastEditedTime: String, title: String) {
        self.id = id
        self.lastEditedTime = lastEditedTime
        self.title = title
    }
}

// MARK: - Networking DTOs

struct GitHubWorkflowRunsResponse: Codable {
    let totalCount: Int
    let workflowRuns: [GitHubWorkflowRun]

    enum CodingKeys: String, CodingKey {
        case totalCount = "total_count"
        case workflowRuns = "workflow_runs"
    }
}

struct NotionSearchResponse: Codable {
    let results: [NotionPageSummary]
}

struct OpenAIMessageResponse: Codable {
    let choices: [Choice]

    struct Choice: Codable {
        let message: Message
    }

    struct Message: Codable {
        let content: String
    }
}

// MARK: - API Client

enum OpsAPIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case serverCode(Int)
    case missingConfiguration(String)
    case decodeError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL configuration."
        case .invalidResponse: return "Unexpected server response."
        case .serverCode(let code): return "Server returned status code \(code)."
        case .missingConfiguration(let field): return "Missing required configuration: \(field)."
        case .decodeError(let details): return "Failed to decode response: \(details)."
        }
    }
}

final class OpsAPI {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchGitHubRuns(settings: AppSettings) async throws -> [GitHubWorkflowRun] {
        guard !settings.githubOwner.isEmpty else { throw OpsAPIError.missingConfiguration("GitHub owner") }
        guard !settings.githubRepo.isEmpty else { throw OpsAPIError.missingConfiguration("GitHub repo") }
        guard !settings.githubWorkflowFile.isEmpty else { throw OpsAPIError.missingConfiguration("GitHub workflow filename") }
        guard !settings.githubToken.isEmpty else { throw OpsAPIError.missingConfiguration("GitHub token") }

        let urlString = "https://api.github.com/repos/\(settings.githubOwner)/\(settings.githubRepo)/actions/workflows/\(settings.githubWorkflowFile)/runs?per_page=10"
        guard let url = URL(string: urlString) else { throw OpsAPIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(settings.githubToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw OpsAPIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw OpsAPIError.serverCode(http.statusCode) }

        do {
            let decoded = try JSONDecoder().decode(GitHubWorkflowRunsResponse.self, from: data)
            return decoded.workflowRuns
        } catch {
            throw OpsAPIError.decodeError(error.localizedDescription)
        }
    }

    func fetchNotionPages(settings: AppSettings) async throws -> [NotionPageSummary] {
        guard !settings.notionToken.isEmpty else { throw OpsAPIError.missingConfiguration("Notion token") }
        guard !settings.notionDatabaseID.isEmpty else { throw OpsAPIError.missingConfiguration("Notion database ID") }

        guard let url = URL(string: "https://api.notion.com/v1/databases/\(settings.notionDatabaseID)/query") else {
            throw OpsAPIError.invalidURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(settings.notionToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("2022-06-28", forHTTPHeaderField: "Notion-Version")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["page_size": 10], options: [])

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw OpsAPIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw OpsAPIError.serverCode(http.statusCode) }

        do {
            let decoded = try JSONDecoder().decode(NotionSearchResponse.self, from: data)
            return decoded.results
        } catch {
            throw OpsAPIError.decodeError(error.localizedDescription)
        }
    }

    func requestAssistantSummary(prompt: String, settings: AppSettings) async throws -> String {
        guard !settings.openAIKey.isEmpty else { throw OpsAPIError.missingConfiguration("OpenAI key") }
        guard let url = URL(string: "https://api.openai.com/v1/chat/completions") else { throw OpsAPIError.invalidURL }

        let payload: [String: Any] = [
            "model": settings.openAIModel,
            "messages": [
                ["role": "system", "content": "You are a construction operations assistant."],
                ["role": "user", "content": prompt]
            ],
            "temperature": 0.2
        ]

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(settings.openAIKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw OpsAPIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw OpsAPIError.serverCode(http.statusCode) }

        do {
            let decoded = try JSONDecoder().decode(OpenAIMessageResponse.self, from: data)
            return decoded.choices.first?.message.content ?? "No assistant response content."
        } catch {
            throw OpsAPIError.decodeError(error.localizedDescription)
        }
    }
}

// MARK: - ViewModel

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var settings = AppSettings()
    @Published var metrics: [OpsMetric] = []
    @Published var githubRuns: [GitHubWorkflowRun] = []
    @Published var notionPages: [NotionPageSummary] = []
    @Published var logs: [OpsLog] = []
    @Published var assistantOutput = ""
    @Published var banner: StatusBanner?
    @Published var isLoading = false

    private let api = OpsAPI()

    private let cacheGitHubKey = "construction.ops.cache.github"
    private let cacheNotionKey = "construction.ops.cache.notion"
    private let cacheLogsKey = "construction.ops.cache.logs"

    init() {
        loadSettings()
        loadCaches()
        buildMetrics()
    }

    func saveSettings() {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: AppSettings.storageKey)
            banner = StatusBanner(kind: .success, message: "Settings saved locally on this iPad.")
            log(source: "app", message: "Settings persisted to UserDefaults")
        } else {
            banner = StatusBanner(kind: .error, message: "Failed to save settings.")
        }
    }

    func refreshAll() {
        Task {
            await refreshGitHub()
            await refreshNotion()
            buildMetrics()
        }
    }

    func refreshGitHub() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let runs = try await api.fetchGitHubRuns(settings: settings)
            githubRuns = runs
            persist(runs, key: cacheGitHubKey)
            buildMetrics()
            banner = StatusBanner(kind: .success, message: "GitHub data refreshed.")
            log(source: "github", message: "Loaded \(runs.count) workflow runs")
        } catch {
            banner = StatusBanner(kind: .warning, message: "GitHub refresh failed. Showing cached data if available.")
            log(source: "github", message: "Refresh failed: \(error.localizedDescription)")
        }
    }

    func refreshNotion() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let pages = try await api.fetchNotionPages(settings: settings)
            notionPages = pages
            persist(pages, key: cacheNotionKey)
            buildMetrics()
            banner = StatusBanner(kind: .success, message: "Notion data refreshed.")
            log(source: "notion", message: "Loaded \(pages.count) notion pages")
        } catch {
            banner = StatusBanner(kind: .warning, message: "Notion refresh failed. Showing cached data if available.")
            log(source: "notion", message: "Refresh failed: \(error.localizedDescription)")
        }
    }

    func generateAssistantSummary() {
        Task {
            do {
                let prompt = "Summarize project health from \(githubRuns.count) GitHub workflow runs and \(notionPages.count) Notion pages."
                let text = try await api.requestAssistantSummary(prompt: prompt, settings: settings)
                assistantOutput = text
                banner = StatusBanner(kind: .success, message: "Assistant summary generated.")
                log(source: "chatgpt", message: "Assistant summary refreshed")
            } catch {
                assistantOutput = "Assistant request failed: \(error.localizedDescription)"
                banner = StatusBanner(kind: .warning, message: "Assistant request failed. Check API settings.")
                log(source: "chatgpt", message: "Assistant failure: \(error.localizedDescription)")
            }
        }
    }

    private func loadSettings() {
        guard let data = UserDefaults.standard.data(forKey: AppSettings.storageKey),
              let saved = try? JSONDecoder().decode(AppSettings.self, from: data) else { return }
        settings = saved
    }

    private func loadCaches() {
        githubRuns = load([GitHubWorkflowRun].self, key: cacheGitHubKey) ?? []
        notionPages = load([NotionPageSummary].self, key: cacheNotionKey) ?? []
        logs = load([OpsLog].self, key: cacheLogsKey) ?? []
    }

    private func persist<T: Codable>(_ model: T, key: String) {
        guard let data = try? JSONEncoder().encode(model) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func load<T: Codable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func log(source: String, message: String) {
        logs.insert(OpsLog(source: source, message: message), at: 0)
        logs = Array(logs.prefix(100))
        persist(logs, key: cacheLogsKey)
    }

    private func buildMetrics() {
        let passing = githubRuns.filter { $0.conclusion == "success" }.count
        metrics = [
            OpsMetric(id: "github_total", title: "GitHub Runs", value: "\(githubRuns.count)", subtitle: "Latest workflow history"),
            OpsMetric(id: "github_success", title: "Passing Runs", value: "\(passing)", subtitle: "Conclusion = success"),
            OpsMetric(id: "notion_pages", title: "Notion Pages", value: "\(notionPages.count)", subtitle: "Cached + latest sync")
        ]
    }
}

// MARK: - Views

struct DashboardRootView: View {
    @StateObject private var vm = DashboardViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                if let banner = vm.banner {
                    BannerView(banner: banner)
                }

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SettingsCard(settings: $vm.settings, onSave: vm.saveSettings)
                        MetricsGrid(metrics: vm.metrics)

                        HStack {
                            Button("Refresh GitHub") {
                                Task { await vm.refreshGitHub() }
                            }
                            .buttonStyle(.borderedProminent)

                            Button("Refresh Notion") {
                                Task { await vm.refreshNotion() }
                            }
                            .buttonStyle(.bordered)

                            Button("Refresh All") {
                                vm.refreshAll()
                            }
                            .buttonStyle(.bordered)
                        }

                        AssistantPanel(
                            text: vm.assistantOutput,
                            onGenerate: vm.generateAssistantSummary
                        )

                        GitHubRunsPanel(runs: vm.githubRuns)
                        NotionPanel(pages: vm.notionPages)
                        LogsPanel(logs: vm.logs)
                    }
                    .padding()
                }
            }
            .navigationTitle("Construction Ops")
        }
    }
}

struct BannerView: View {
    let banner: StatusBanner

    var body: some View {
        HStack {
            Text(banner.message)
                .font(.subheadline)
                .foregroundStyle(.white)
            Spacer()
        }
        .padding(10)
        .background(color)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }

    private var color: Color {
        switch banner.kind {
        case .info: return .blue
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }
}

struct SettingsCard: View {
    @Binding var settings: AppSettings
    let onSave: () -> Void

    var body: some View {
        GroupBox("Connections") {
            VStack(spacing: 10) {
                TextField("GitHub owner", text: $settings.githubOwner)
                TextField("GitHub repo", text: $settings.githubRepo)
                TextField("GitHub workflow file (e.g. ci.yml)", text: $settings.githubWorkflowFile)
                SecureField("GitHub token", text: $settings.githubToken)

                Divider()

                TextField("Notion database ID", text: $settings.notionDatabaseID)
                SecureField("Notion token", text: $settings.notionToken)

                Divider()

                TextField("OpenAI model", text: $settings.openAIModel)
                SecureField("OpenAI key", text: $settings.openAIKey)

                Button("Save Settings", action: onSave)
                    .buttonStyle(.borderedProminent)
            }
            .textFieldStyle(.roundedBorder)
        }
    }
}

struct MetricsGrid: View {
    let metrics: [OpsMetric]

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(metrics) { metric in
                VStack(alignment: .leading, spacing: 6) {
                    Text(metric.title).font(.headline)
                    Text(metric.value).font(.title2).bold()
                    Text(metric.subtitle).font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

struct AssistantPanel: View {
    let text: String
    let onGenerate: () -> Void

    var body: some View {
        GroupBox("ChatGPT Summary") {
            VStack(alignment: .leading, spacing: 8) {
                Button("Generate Summary", action: onGenerate)
                    .buttonStyle(.borderedProminent)

                Text(text.isEmpty ? "No summary generated yet." : text)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }
}

struct GitHubRunsPanel: View {
    let runs: [GitHubWorkflowRun]

    var body: some View {
        GroupBox("GitHub Workflow Runs") {
            if runs.isEmpty {
                Text("No runs loaded yet.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(runs.prefix(5)) { run in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Run #\(run.id) • \(run.status)")
                                .font(.headline)
                            Text("Conclusion: \(run.conclusion ?? "n/a")")
                                .font(.subheadline)
                            Link("Open in GitHub", destination: URL(string: run.htmlURL) ?? URL(string: "https://github.com")!)
                                .font(.caption)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}

struct NotionPanel: View {
    let pages: [NotionPageSummary]

    var body: some View {
        GroupBox("Notion Pages") {
            if pages.isEmpty {
                Text("No pages loaded yet.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(pages.prefix(5)) { page in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(page.title)
                                .font(.headline)
                            Text("Last edited: \(page.lastEditedTime)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}

struct LogsPanel: View {
    let logs: [OpsLog]

    private var formatter: DateFormatter {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .medium
        return f
    }

    var body: some View {
        GroupBox("Event Log") {
            if logs.isEmpty {
                Text("No events logged yet.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(logs.prefix(10)) { log in
                        Text("[\(formatter.string(from: log.timestamp))] [\(log.source)] \(log.message)")
                            .font(.caption)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(6)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
        }
    }
}

// MARK: - Optional WebView (Playgrounds-compatible helper)

struct EmbeddedWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        WKWebView(frame: .zero)
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.load(URLRequest(url: url))
    }
}
