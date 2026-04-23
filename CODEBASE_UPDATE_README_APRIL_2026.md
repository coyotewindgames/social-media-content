# Social Media Content Platform: Codebase Overview + 2-Week Update

Last updated: 2026-04-22
Update window covered: last 2 weeks from git history (`git log --since="2 weeks ago"`)

## 1) What This Repository Is

This repository contains a full-stack social media automation platform with:

- A React + Vite frontend dashboard for running, monitoring, and refining content pipelines.
- A Node.js + TypeScript backend orchestrator (`orchestrator-node`) that coordinates AI agents.
- Supabase-backed persistence for runs, analytics, approvals, and persona/refinement data.
- Deployment and CI/CD configuration for Netlify (frontend) and containerized backend hosting.

Core goal: automate the workflow from topic discovery to post generation, image generation, optional refinement, and publishing.

## 2) High-Level Architecture

- Frontend (`src/`)
  - UI for triggering pipeline runs, viewing run history, refining generated content, and managing persona/config settings.
  - Uses `src/lib/orchestrator-api.ts` as the typed API client to the backend.

- Backend Orchestrator (`orchestrator-node/src/`)
  - Agent-based workflow (news, content, image, ranking, persona, publish).
  - Pipeline engine and step system for structured execution and partial/final results.
  - Express API server for health, configuration, pipeline run/status/result/history, and refinement/publish endpoints.

- Data Layer
  - Supabase schema and migrations in `orchestrator-node/supabase-*.sql`.
  - Repositories for analytics, pipeline runs, approval queue, and related persistence.

- Ops/Infra
  - Docker + `docker-compose.yml` + `Caddyfile` for containerized deployment.
  - Netlify config + GitHub Actions workflows for preview/deployment flows.

## 3) Directory Map (Key Paths)

- `src/`: Frontend app
- `src/components/`: Dashboard dialogs, cards, panels, and pipeline UI
- `src/lib/`: API clients and integration helpers
- `orchestrator-node/src/agents/`: Specialized backend agents
- `orchestrator-node/src/pipeline/`: Pipeline engine, context, steps
- `orchestrator-node/src/repositories/`: Supabase data access
- `orchestrator-node/src/services/`: Persona/refinement business logic
- `.github/workflows/`: CI/CD workflows
- Root deployment docs:
  - `BACKEND_DEPLOYMENT.md`
  - `DEPLOYMENT_PLAN.md`
  - `AUTOMATION_SETUP.md`

## 4) Technology Stack

Frontend:
- React 19 + TypeScript
- Vite
- Tailwind ecosystem + component utilities
- TanStack Query + charting/UX libraries

Backend:
- Node.js + TypeScript
- Express 5
- Supabase JS SDK
- Jest + ts-jest

Integrations:
- LLM/image providers (OpenAI/Anthropic/Ollama and image generation paths)
- Social platform publishing paths (platform dependent)
- News/topic ingestion

## 5) How to Run (Dev)

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
cd orchestrator-node
npm install
npm run serve
```

### Build

```bash
# frontend
npm run build

# backend
cd orchestrator-node
npm run build
```

## 6) What Changed in the Last Two Weeks

### Summary

Most work focused on backend orchestration refactors, pipeline/agent enhancements, frontend pipeline dashboard integration, and deployment hardening.

Approximate change distribution (from `git log --numstat` aggregation):

- `orchestrator-node`: 60 file touches, +3949 / -957
- `src` (frontend): 18 file touches, +849 / -40
- `BACKEND_DEPLOYMENT.md`: +241
- `.github` workflows: +134 / -2
- `netlify.toml`: +24 / -2
- `.env.example`: +8

### Notable Functional Updates

1. Pipeline and orchestration refactor
- Large-scale update to pipeline engine, context, step architecture, and run flow.
- Expanded/cleaned step modules (news retrieval, persona, ranking, content generation, image generation, refinement, publishing, analytics, approvals).

2. Agent and model improvements
- Updates across content, image, persona, ranking, and publish agents.
- News agent tuning: simplified query behavior, expanded recency window to 48h, and looser keyword filtering for better recall.

3. API/client integration improvements
- Frontend API client (`src/lib/orchestrator-api.ts`) updated with stronger typing and broader endpoint coverage.
- Added/updated support for run history/status/result retrieval and refinement operations.

4. Frontend UX and pipeline controls
- Changes to dashboard and run-history surfaces (`PipelineDashboard`, `RunHistory`, `RefineDialog`, `ContentCard`) to better represent pipeline status and refinement workflow.

5. Deployment and environment reliability
- Added backend deployment workflow and Docker deployment support.
- Added backend API URL configuration path for frontend environments.
- Added Render secret file loading support (`/etc/secrets/.env`) in backend startup paths.

6. Netlify and security hardening
- Added/refined `netlify.toml` for build settings, SPA routing behavior, and headers.
- Tightened CSP and adjusted workflow permissions in CI.

7. Data model and persistence expansion
- Added/refined Supabase schema/migration SQL, including social accounts and refinement-related migration files.
- Repository/service layer additions for analytics, approvals, and refinement/persona support.

8. Test coverage additions
- Expanded backend tests around deduplication, persona consistency, ranking behavior, and agent-related functionality.

## 7) Commit Timeline (Last 2 Weeks)

Representative commits in this window:

- 2026-04-17 `6655c05` some tweaks
- 2026-04-17 `d249f05` refactor
- 2026-04-14 `bc9128c` more stuff
- 2026-04-14 `325992d` Fix news agent query/recency/keyword filtering
- 2026-04-14 `8d0660e` Load `.env` from Render secret path
- 2026-04-14 `c819350` Add Docker backend deployment workflow + API URL config
- 2026-04-14 `38d3b9f` tighten CSP + workflow permission improvements
- 2026-04-14 `0b82ac0` add Netlify build/SPA/security configuration
- 2026-04-13 `3024e9c` broad multi-file backend/frontend update

## 8) Current State and Readiness

The codebase now has:

- A significantly more structured backend pipeline architecture.
- Better operational deployment paths for separated frontend/backend hosting.
- Improved frontend visibility/control over pipeline execution and refinement.
- Stronger security and hosting configuration hygiene.

## 9) Suggested Next Priorities

- Normalize commit message quality for future reporting (current log has several generic messages).
- Add a single canonical root README (replace Spark template placeholder) that links to backend/docs.
- Add automated release notes generation from commit labels/scopes.
- Add end-to-end tests for pipeline run + refine + publish happy path.

---

If needed, this document can be converted into a shorter stakeholder version (non-technical) or a release-note version grouped by feature, bugfix, infrastructure, and security.
