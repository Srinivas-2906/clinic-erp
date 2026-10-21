# Decisions and risks — M1

## Decision: Can `Srinivas-2906/clinic-erp` become the canonical repo?

**Yes, with conditions** — a **new** repository is **not** required.

| Criterion | Assessment |
|-----------|------------|
| Repo already exists | `clinic-erp` on GitHub |
| Structure matches product | `apps/api` + `apps/crm` monorepo (npm workspaces) |
| Staleness | `main` is August 2026 snapshot; **must** fast-forward via `feature/m1-repository-separation` |
| Production coupling | Deploy still wired to **`kaana-prod`** paths; cutover is CI/infra, not greenfield repo |
| Parallel effort | `kaana-clinic` nested repo targets same product but **Postgres-first** — merge strategy needed before making it canonical |

**Alternative rejected for M1:** creating a third repo — adds confusion vs refreshing `clinic-erp`.

## Shared dependencies on unrelated projects

| Dependency | Location | Risk if clinic moves |
|------------|----------|----------------------|
| HTTPS URL map / NEG setup | `Demos/scripts/url-map-multi.yaml`, `setup-clinic-api-backend.sh` | Host routing unchanged until infra edited |
| Denta Care marketing site | `Demos/dental-clinic` | Public booking proxies to `clinic-api`; still deployed from `kaana-prod` |
| Kaana marketing portfolio | `Demos/kaana` (screenshots, case studies) | Cosmetic / SEO only |
| Multi-product `cloudbuild.yaml` | `Demos/cloudbuild.yaml` | Accidental clinic redeploy if suite build run |
| Secrets | GitHub `GCP_SA_KEY` on `kaana-prod` | New repo needs same or scoped SA for M2 |

No runtime code dependency from clinic-api to `kaana-platform` or `botiq` was found.

## Deployment & repository change risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Push to `kaana-prod` `main` under `clinic-api/**` | **High** — triggers `deploy-clinic` (currently failing but attempts Cloud Build) | Path filters; fix workflow before relying on it |
| Push to `clinic-erp` `main` with new workflow | **Medium** — only after secrets + project wired | Add workflow in M2 with staging first |
| Deleting `clinic-*` from `kaana-prod` before cutover | **Critical** | Do not remove until prod deploy from `clinic-erp` proven |
| `kaana-clinic` Postgres experiments deployed by mistake | **High** | Keep PG work off prod paths until explicit milestone |
| Two divergent copies (Demos vs clinic-erp) | **Medium** | Single write path after M2; until then sync discipline |

## Approvals required before remote/production impact

1. **Push** `feature/m1-repository-separation` to `Srinivas-2906/clinic-erp` (non-main OK with team policy).
2. **Add** `GCP_SA_KEY` (or WIF) to `clinic-erp` GitHub secrets.
3. **Change** `deploy-clinic` on `kaana-prod` or **disable** path filters to prevent double deploy.
4. **Run** Cloud Build against `clinic-erp` (charges prod project if same substitutions).
5. **Update** URL map / DNS (unlikely for M2 if service names unchanged).

## MCP / tooling gaps this session

- **user-github MCP:** discovery error (tools unavailable); used `gh` CLI successfully.
- **gcloud:** reauthentication required; no Cloud Run revision proof.

## M1 completion status

| Item | Status |
|------|--------|
| Evidence gathering | Done |
| Local workspace | Done |
| Docs | Done |
| Local commit on feature branch | **Pending user** (changes unstaged/uncommitted unless user requests commit) |
| Remote push | **Not done** (by design) |
| Production change | **None** |
