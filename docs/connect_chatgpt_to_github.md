# Connect ChatGPT to GitHub

Use these steps to connect your GitHub account to ChatGPT so ChatGPT can access your repositories (based on the permissions you approve).

## Prerequisites

- A ChatGPT account (Team, Enterprise, or any plan where the GitHub connector is available)
- A GitHub account with access to the repositories you want ChatGPT to use
- Permission to install/authorize apps in your GitHub org (if using organization repos)

## Steps

1. In ChatGPT, open **Settings**.
2. Go to **Connected apps** (or **Connectors**, depending on your workspace UI).
3. Choose **GitHub** and click **Connect**.
4. Sign in to GitHub when prompted.
5. Authorize the ChatGPT GitHub app.
6. Select repository access:
   - **All repositories**, or
   - **Only selected repositories** (recommended for least privilege)
7. Confirm and return to ChatGPT.

## Verify the connection

- In ChatGPT, start a new chat and ask it to read a file from one of the authorized repositories.
- If it cannot access the repository, check:
  - Connector status in ChatGPT settings
  - GitHub app installation permissions
  - Org-level restrictions and SSO requirements

## Automate with ChatGPT + GitHub Actions

Use GitHub Actions to run ChatGPT on repository events (for example: summarize a pull request diff, generate release notes, or draft issue triage comments).

### 1) Add secrets

In your repository settings, add:

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, default is `gpt-4o-mini` in example below)

### 2) Create an automation workflow

Create `.github/workflows/chatgpt_automation.yml`:

```yaml
name: ChatGPT Automation

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  summarize-pr:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Build PR diff payload
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh pr diff ${{ github.event.pull_request.number }} > pr.diff

      - name: Ask ChatGPT for summary
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_MODEL: ${{ secrets.OPENAI_MODEL || 'gpt-4o-mini' }}
        run: |
          python - <<'PY'
          import json, os
          from pathlib import Path
          import urllib.request

          diff = Path('pr.diff').read_text(encoding='utf-8')[:120000]
          prompt = (
              "Summarize this pull request diff for reviewers in bullet points. "
              "Include: what changed, risk areas, and suggested test focus.\n\n"
              f"{diff}"
          )

          body = {
              "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
              "messages": [
                  {"role": "system", "content": "You are a precise senior code reviewer."},
                  {"role": "user", "content": prompt}
              ]
          }

          req = urllib.request.Request(
              "https://api.openai.com/v1/chat/completions",
              data=json.dumps(body).encode("utf-8"),
              headers={
                  "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                  "Content-Type": "application/json"
              },
              method="POST"
          )
          with urllib.request.urlopen(req) as r:
              response = json.loads(r.read().decode("utf-8"))

          summary = response["choices"][0]["message"]["content"].strip()
          Path("summary.md").write_text(summary, encoding="utf-8")
          PY

      - name: Post summary comment to PR
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh pr comment ${{ github.event.pull_request.number }} --body-file summary.md
```

### 3) Start with low-risk use cases

Recommended first automations:

- PR change summaries
- Release notes draft from merged PR titles
- Label suggestions for incoming issues

Then move to higher-impact automations (with review gates), such as:

- Draft migration guides
- Draft implementation plans
- CI failure triage suggestions

### 4) Add guardrails

- Keep humans in the approval loop for code changes.
- Mask secrets and avoid sending sensitive data in prompts.
- Restrict workflow permissions to least privilege.
- Add prompt instructions to avoid overconfident output.

## Security recommendations

- Prefer **selected repositories** over full account access.
- Revoke access when no longer needed from:
  - GitHub: **Settings → Applications → Authorized GitHub Apps**
  - ChatGPT: **Settings → Connected apps**
- Rotate personal access credentials if your security policy requires periodic resets.

## Troubleshooting

- **Missing GitHub option in ChatGPT:** the connector may not be enabled for your plan/workspace.
- **Org repositories not visible:** ask your GitHub org admin to approve the app and required SSO.
- **Access denied errors:** re-run authorization and ensure the repo is included in selected repositories.
- **Workflow cannot call OpenAI API:** verify `OPENAI_API_KEY` secret exists and outbound network is allowed in GitHub Actions.

## Repository-specific autonomous mode (this repo)

This repository now includes `.github/workflows/autonomous_dashboard_refresh.yml`, which:

- Runs daily (and via manual dispatch)
- Executes `node scripts/run_orchestrator.mjs`
- Regenerates `dashboard_latest.json`
- Opens a PR automatically when data changed

To enable it, add the API secrets listed in `docs/repository_review.md` and run the workflow once manually from **Actions**.
