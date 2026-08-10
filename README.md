# VARE — Breast-Cancer Risk Avatar Prototype

A full-stack educational prototype built with React, TypeScript, Vite, and
Cloudflare Workers: a mock breast-cancer risk result, a theory-informed
adaptive dialogue engine, and a transparent, locally-retrieved evidence
pipeline grounding the chat replies. It is an **evidence-grounded,
theory-informed educational prototype** — not a diagnostic tool, not
clinically validated, and not proven to change behavior. See
[`docs/design-rationale.md`](./docs/design-rationale.md) for the full
rationale.

The prototype’s distinctive contribution is its **adaptive orchestration
layer**. It separates conversational-state interpretation, decisional-needs
support, behavioral-theory strategy selection, medical evidence
retrieval, dynamic language generation, and deterministic safety
validation. The application is designed to address contributors to
decisional conflict and improve decision preparedness. Clinical
effectiveness has not been established. See
[`docs/PROJECT_INNOVATION_SUMMARY.md`](./docs/PROJECT_INNOVATION_SUMMARY.md)
and [`docs/NOVELTY_AND_RESEARCH_GAP.md`](./docs/NOVELTY_AND_RESEARCH_GAP.md).

As of Phase 5, the chat pipeline can optionally use **Groq** for dynamic,
evidence-grounded dialogue generation and turn classification — see
[`docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md`](./docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md).
Groq is entirely optional: without a `GROQ_API_KEY`, the application falls
back automatically to the same local, deterministic classifier and
response generator used since Phase 3/4, grounded in the same local,
keyword-based evidence retriever (no external vector database). LiveAvatar
(video presenter) and Cloudflare Vectorize are **not** implemented in this
phase. See [`docs/RAG_ARCHITECTURE.md`](./docs/RAG_ARCHITECTURE.md) and
[`docs/ADAPTIVE_STATE_MODEL.md`](./docs/ADAPTIVE_STATE_MODEL.md) for the
deterministic layers this all still builds on.

## What's implemented

- **Consent screen** → **built-in Gail-inspired educational calculator**
  (plus optional average/elevated demo shortcuts) → **chat** with static
  Maya avatar + text failover, `localStorage` session persistence, Reset,
  and Download Session **JSON / CSV** exports (with analysis notes).
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
  emotional crisis — these always override generated text and are checked
  *before* any Groq call, so Groq is never invoked for a flagged message.
- **Optional Groq-powered dynamic dialogue** (`worker/llm/`): when
  `GROQ_API_KEY` is configured, turn classification and response
  generation use Groq structured-output calls, with automatic,
  deterministic local fallback on any failure, invalid output, or
  detected near-duplicate response — see
  [`docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md`](./docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md).
  Groq never chooses the dialogue strategy, never supplies medical facts
  outside the retrieved evidence, and never sees the API key exposed
  anywhere outside the Worker.
- **Developer Panel** (visible in dev mode or via a "Developer details"
  disclosure): shows Groq configuration status, the adaptive-state
  estimate and current-turn evidence, selected strategy, theory mapping,
  retrieval query, full source metadata, and generation diagnostics
  (response mode, repetition/regeneration, fallback reason) for the
  latest reply.

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
cp .dev.vars.example .dev.vars   # optional — see "Enabling dynamic Groq dialogue" below
```

## Local development

```bash
npm run dev
```

This starts a single Vite dev server (default: http://localhost:5173) that
serves the React app and runs the Worker in the Workers runtime via
`@cloudflare/vite-plugin`, so `/api/*` requests are handled by
`worker/index.ts` without a separate process.

## Enabling dynamic Groq dialogue (optional)

The application works fully without this — omitting it simply keeps the
chat pipeline on local, deterministic classification and generation.

1. Get a Groq API key from [console.groq.com](https://console.groq.com/).
2. Create a `.dev.vars` file next to `wrangler.jsonc` (copy
   `.dev.vars.example` if you haven't already):

   ```
   GROQ_API_KEY="PASTE_REAL_KEY_HERE"
   GROQ_MODEL="openai/gpt-oss-20b"
   ```

3. **`.dev.vars` must never be committed** — it's already excluded via
   `.gitignore` (`.dev.vars`, `.dev.vars.*`, keeping only
   `.dev.vars.example` tracked).
4. Restart `npm run dev` after creating or changing `.dev.vars` — Wrangler
   only reads it at startup.
5. Check `GET /api/config-status` (or the Developer Panel's
   "Configuration" section) to confirm `groqConfigured: true` and
   `dynamicModeAvailable: true`.

See [`docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md`](./docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md)
for the full design, privacy handling, and fallback behavior.

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
  "version": "0.5.0"
}
```

The React page calls this endpoint on load and displays whether the backend
is connected.

### `POST /api/mock-risk`

Accepts either:

- `{ "inputs": { age, ageAtMenarche, ageAtFirstLiveBirth, firstDegreeRelatives, priorBiopsies, atypicalHyperplasia } }` — simplified educational estimate (not NCI BCRAT), or
- `{ "scenario": "average" | "elevated" }` — fixed demo branches for testing.


### `GET /api/config-status`

Returns, without ever exposing the API key or making a provider request:

```json
{
  "backendConnected": true,
  "groqConfigured": false,
  "groqModel": "openai/gpt-oss-20b",
  "dynamicModeAvailable": false
}
```

### `POST /api/chat`

Accepts `{ "message": string, "history"?: ..., "riskResult"?: ...,
"previousState"?: ... }`. Runs the full Phase 5 pipeline described in
[`docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md`](./docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md):
deterministic safety pre-check → Groq structured-state classification
(local fallback automatic) → state transition → deterministic
theory-based strategy selection → local evidence retrieval (medical-rag
only) → Groq dynamic response generation (local fallback automatic) →
response + grounded-evidence validation → semantic repetition check.
Returns `reply`, `adaptiveState`, `currentTurnEvidence`, `strategy`,
`theoryConstruct`, `retrievalQuery`, `sources` (medical-rag evidence
metadata only), `dialogueDesignSources` (theory-support metadata,
developer-only), `usedEvidenceIds`, `classificationMode`, `responseMode`,
`groqModel`, `repetitionDetected`, `regenerationUsed`, an optional
`fallbackReason`, and `timestamp`. No message content is persisted
server-side, and the Groq API key is never included in this response.

## Documentation

| Doc | Covers |
|---|---|
| [`docs/ADAPTIVE_STATE_MODEL.md`](./docs/ADAPTIVE_STATE_MODEL.md) | The temporary conversational-state classifier — not a diagnostic model |
| [`docs/THEORY_DIALOGUE_MAP.md`](./docs/THEORY_DIALOGUE_MAP.md) | Strategy priority order, theory mapping, and dialogue-design source citations |
| [`docs/RAG_ARCHITECTURE.md`](./docs/RAG_ARCHITECTURE.md) | The local retrieval pipeline, medical-rag/dialogue-design separation, and limitations |
| [`docs/EVIDENCE_REGISTER.md`](./docs/EVIDENCE_REGISTER.md) | The 10 vetted sources and 17 evidence chunks currently in use |
| [`docs/SOURCE_REPLACEMENT_CHECKLIST.md`](./docs/SOURCE_REPLACEMENT_CHECKLIST.md) | How to vet and add a new evidence source |
| [`docs/TEST_SCENARIOS.md`](./docs/TEST_SCENARIOS.md) | Manual test scripts for the dialogue engine |
| [`docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md`](./docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md) | Groq-powered dynamic classification/generation, validation, repetition control, and local fallback |
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
