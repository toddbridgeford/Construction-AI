# Deployment

## Production branch and worker

- Production branch: `Predictive-Model`
- Production worker name: `construction-ai`
- Production URL: `https://construction-ai.toddbridgeford.workers.dev`
- Canonical Wrangler file: `/wrangler.toml`

Only `.github/workflows/deploy_worker.yml` deploys production, and only for pushes to `Predictive-Model`.

## GitHub Environment protection

The deploy job uses `environment: production`.

In GitHub repository settings:
1. Go to **Settings → Environments → production**.
2. Add **Required reviewers**.
3. Optionally restrict deployment branches to `Predictive-Model`.

This prevents accidental production deploys.

## Cloudflare Builds/Worker connection

- Keep repository root as the Cloudflare build root (`/`).
- Keep `wrangler.toml` at repository root.
- Ensure `wrangler.toml` points to `main = "src/worker.js"`.
- Configure secrets in GitHub Actions:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`

## Verification checklist

After deployment, verify:

- `/health`
  - https://construction-ai.toddbridgeford.workers.dev/health
- `/cpi`
  - https://construction-ai.toddbridgeford.workers.dev/cpi
- `/fred/observations?series_id=CPIAUCSL&limit=5`
  - https://construction-ai.toddbridgeford.workers.dev/fred/observations?series_id=CPIAUCSL&limit=5

Also confirm `/` returns the same payload shape as `/health`.

## Data outputs

All generated data outputs live in `/artifacts`.

Domain note for analytics: **Commercial means Nonresidential construction spending**.
