# VARE — Breast-Cancer Risk Avatar Prototype

A full-stack educational prototype built with React, TypeScript, Vite, and
Cloudflare Workers: a mock breast-cancer risk result, a theory-informed
adaptive dialogue engine, and a transparent, locally-retrieved evidence
pipeline grounding the chat replies. It is an **evidence-grounded,
theory-informed educational prototype** — not a diagnostic tool, not
clinically validated, and not proven to change behavior. See
[`docs/design-rationale.md`](./docs/design-rationale.md) for the full
rationale.

Groq (hosted LLM) and LiveAvatar (video presenter) are **not** implemented
yet — the chat pipeline currently uses a local, deterministic response
generator (no external LLM) grounded in a local, keyword-based evidence
retriever (no external vector database or API key). See
[`docs/RAG_ARCHITECTURE.md`](./docs/RAG_ARCHITECTURE.md) and
[`docs/ADAPTIVE_STATE_MODEL.md`](./docs/ADAPTIVE_STATE_MODEL.md) for how
this works today.

## What's implemented

- **Consent screen** → **mock risk calculator** (`average`/`elevated`
  demonstration branches) → **chat**, with `localStorage` session
  persistence, a Reset Session action, and a Download Session JSON export.
- **Adaptive dialogue engine** (`worker/behavioral/`): a deterministic,
  rule-based classifier estimates temporary conversational state
  (understanding, emotion, barrier, self-efficacy, readiness, safety flag)
  per message and selects a theory-informed dialogue strategy. These are
  temporary conversational-state *estimates* for prototype testing, never
  a psychological diagnosis — see
  [`docs/ADAPTIVE_STATE_MODEL.md`](./docs/ADAPTIVE_STATE_MODEL.md).
- **Local RAG evidence pipeline** (`worker/rag/`): every chat reply's
  factual/medical claims are grounded in evidence retrieved (via local
  cosine-similarity search — no embeddings, no network call) from **17
  vetted, traceable chunks from 10 real sources** (National Cancer
  Institute, USPSTF, and peer-reviewed behavioral-science literature) —
  see [`docs/EVIDENCE_REGISTER.md`](./docs/EVIDENCE_REGISTER.md). Medical
  sources (`medical-rag`) are the only kind ever used to ground a reply;
  behavioral-theory sources (`dialogue-design`) justify *technique*
  choices only and are surfaced solely in developer diagnostics/docs.
- **Fixed safety responses and output validation**
  (`worker/safety/`) for diagnosis/treatment requests, urgent symptoms, and
  emotional crisis — these always override generated text.
- **Developer Panel** (visible in dev mode or via a "Developer details"
  disclosure): shows the adaptive-state estimate, selected strategy, theory
  mapping, retrieval query, and full source metadata for the latest reply.

## Stack

- **Frontend**: React 19 + TypeScript, served from `src/`
- **Backend**: Cloudflare Worker, entry point at `worker/index.ts`
- **Tooling**: Vite + `@cloudflare/vite-plugin` (unified dev server for
  frontend and Worker), Vitest for tests, npm for package management

## Project structure

```
src/            React frontend (entry: src/main.tsx)
worker/         Cloudflare Worker backend (entry: worker/index.ts)
tests/          Vitest tests (tests/frontend, tests/worker)
docs/           Project documentation
public/         Static assets served as-is
scripts/        Local dev/maintenance helper scripts
```

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # optional for this phase; no secrets required yet
```

## Local development

```bash
npm run dev
```

This starts a single Vite dev server (default: http://localhost:5173) that
serves the React app and runs the Worker in the Workers runtime via
`@cloudflare/vite-plugin`, so `/api/*` requests are handled by
`worker/index.ts` without a separate process.

## Scripts

| Script | Description |
|--------|--------------|
| `npm run dev` | Start the unified Vite + Worker dev server |
| `npm run test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run evidence:check` | Run the evidence-collection structural validation and medical-rag/dialogue-design separation tests (`worker/rag/validateEvidence.ts`) |
| `npm run typecheck` | Type-check the frontend (`tsconfig.json`) and the Worker (`tsconfig.worker.json`) |
| `npm run build` | Build the production frontend + Worker bundle |
| `npm run deploy` | Build and deploy to Cloudflare Workers |
| `npm run check` | Run tests, evidence checks, type checking, and the production build — the full CI gate |

## API

### `GET /api/health`

Returns:

```json
{
  "status": "ok",
  "timestamp": "2026-08-04T12:00:00.000Z",
  "version": "0.1.0"
}
```

The React page calls this endpoint on load and displays whether the backend
is connected.

### `POST /api/mock-risk`

Accepts `{ "scenario": "average" | "elevated" }` and returns the
corresponding demonstration risk result (not a real calculation).

### `POST /api/chat`

Accepts `{ "message": string, "history"?: ... }`. Runs the full pipeline
described in [`docs/RAG_ARCHITECTURE.md`](./docs/RAG_ARCHITECTURE.md):
adaptive-state classification → theory-based strategy selection →
retrieval-query build → local evidence retrieval (medical-rag only) →
safety check → response generation/validation. Returns `reply`,
`adaptiveState`, `strategy`, `theoryConstruct`, `retrievalQuery`,
`sources` (medical-rag evidence metadata only), `dialogueDesignSources`
(theory-support metadata, developer-only), `responseMode`, and
`timestamp`. No message content is persisted server-side.

## Documentation

| Doc | Covers |
|---|---|
| [`docs/ADAPTIVE_STATE_MODEL.md`](./docs/ADAPTIVE_STATE_MODEL.md) | The temporary conversational-state classifier — not a diagnostic model |
| [`docs/THEORY_DIALOGUE_MAP.md`](./docs/THEORY_DIALOGUE_MAP.md) | Strategy priority order, theory mapping, and dialogue-design source citations |
| [`docs/RAG_ARCHITECTURE.md`](./docs/RAG_ARCHITECTURE.md) | The local retrieval pipeline, medical-rag/dialogue-design separation, and limitations |
| [`docs/EVIDENCE_REGISTER.md`](./docs/EVIDENCE_REGISTER.md) | The 10 vetted sources and 17 evidence chunks currently in use |
| [`docs/SOURCE_REPLACEMENT_CHECKLIST.md`](./docs/SOURCE_REPLACEMENT_CHECKLIST.md) | How to vet and add a new evidence source |
| [`docs/TEST_SCENARIOS.md`](./docs/TEST_SCENARIOS.md) | Manual test scripts for the dialogue engine |
| [`docs/design-rationale.md`](./docs/design-rationale.md) | One-page design rationale and current-vs-planned scope |

## Development environment note (local machine)

This machine's `C:` drive is nearly full. `node_modules`, `.wrangler`, and
`dist` are currently NTFS junctions pointing to `D:\dev-cache\breast-cancer-risk-avatar\`
so installs/builds don't fail with `ENOSPC`. If you ever run `npm install` (or
`npm ci`) directly in this folder again, npm will delete the `node_modules`
junction and recreate it as a real directory on `C:`, which can fail again if
`C:` is still low on space. If that happens:

```powershell
# Install into the real (roomy) location on D:, then re-link:
robocopy . D:\dev-cache\breast-cancer-risk-avatar package.json package-lock.json
cd D:\dev-cache\breast-cancer-risk-avatar; npm install; cd -
Remove-Item node_modules -Recurse -Force
New-Item -ItemType Junction -Path node_modules -Target D:\dev-cache\breast-cancer-risk-avatar\node_modules
```

Freeing real space on `C:` removes the need for this workaround entirely.

## Deployment

```bash
npx wrangler login
npm run deploy
```

## License

MIT — educational/prototype project.
