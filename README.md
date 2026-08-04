# VARE — Breast-Cancer Risk Avatar Prototype

Foundation for a full-stack application built with React, TypeScript, Vite,
and Cloudflare Workers. This phase establishes the project scaffolding and a
working `/api/health` round-trip between the frontend and the Worker backend.

Groq, RAG, the risk calculator, and LiveAvatar are **not** implemented yet —
they are planned for later phases.

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
| `npm run typecheck` | Type-check the frontend (`tsconfig.json`) and the Worker (`tsconfig.worker.json`) |
| `npm run build` | Build the production frontend + Worker bundle |
| `npm run deploy` | Build and deploy to Cloudflare Workers |
| `npm run check` | Run tests, type checking, and the production build — the full CI gate |

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
