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
