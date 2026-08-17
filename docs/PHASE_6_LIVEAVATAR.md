# Phase 6 — LiveAvatar Embodied Delivery (6A)

## Purpose

Phase 6 adds **LiveAvatar LITE** as an optional embodied delivery layer.
The existing conversational engine remains authoritative:

```
user text → semantic interpretation → adaptive state → planning →
calculator / RAG → Groq → validation → FINAL TEXT
        ↓                              ↓
     Text UI                     Embodiment policy → TTS → LiveAvatar video
```

LiveAvatar does **not** decide what to say. It only speaks (or visually
presents) the already validated assistant text.

## Mode: LITE (default — credit efficient)

Default `LIVEAVATAR_MODE=LITE` (1 credit/min):

- Dialogue text still comes from this app’s Groq pipeline (verbatim).
- Speech audio comes from **Groq Orpheus TTS** (`GROQ_API_KEY`).
- LiveAvatar only lip-syncs video from that PCM.

`LIVEAVATAR_MODE=FULL` remains available (2 credits/min, built-in TTS via
`speak_text`) but should be avoided on a small Starter budget.

Credit plan: [`docs/LIVEAVATAR_CREDIT_BUDGET.md`](./LIVEAVATAR_CREDIT_BUDGET.md).

Critical safety rule still holds:

- The app decides the medical text (Phase 5 pipeline).
- Delivery uses **verbatim** validated text → TTS → `repeatAudio` (LITE)
  or `repeat(text)` (FULL). Never `message()` / `avatar.speak_response`.
- Mic / voice chat stays off for LiveAvatar’s native LLM.

## API (current)

Base URL: `https://api.liveavatar.com`

| Step | Endpoint | Auth |
|------|----------|------|
| Create session token | `POST /v1/sessions/token` | `X-API-KEY` (Worker only) |
| Start session | `POST /v1/sessions/start` | Bearer session JWT (web SDK) |
| Keep alive | `POST /v1/sessions/keep-alive` | Bearer session JWT |
| Stop | `DELETE /v1/sessions` | Bearer session JWT |

LITE WebSocket commands: `agent.speak`, `agent.speak_end`, `agent.interrupt`,
`session.keep_alive`, `agent.start_listening`, `agent.stop_listening`.

Client package: `@heygen/liveavatar-web-sdk` (`LiveAvatarSession`).

## Audio format (documented)

| Parameter | Value |
|-----------|-------|
| Encoding | PCM 16-bit little-endian |
| Sample rate | 24,000 Hz |
| Channels | Mono |
| Transport | Base64 over WebSocket |
| Chunking | ~600 ms first, then ~1 s |
| Max packet | 1 MB |

## Sandbox vs production avatar

- `LIVEAVATAR_SANDBOX=true` forces Sandbox Wayne (`dd73ea75-1218-4ef3-92ce-606d5f7fbc0a`). Sessions are short (~1 minute) and do not consume credits.
- `LIVEAVATAR_SANDBOX=false` uses `LIVEAVATAR_AVATAR_ID` (and optional `LIVEAVATAR_VOICE_ID`). These sessions use LiveAvatar credits.

Default in `wrangler.jsonc`: **LITE** + doctor **Ann Sitting** (`LIVEAVATAR_SANDBOX=false`)
+ **120s** session cap. LITE plays Groq TTS in the browser so you hear voice while
the avatar lip-syncs. Set sandbox `true` only for free Wayne testing.

## Security

- Secret name: `LIVEAVATAR_API_KEY`
- Local file: `.dev.vars` (gitignored)
- Production: `npx wrangler secret put LIVEAVATAR_API_KEY`
- Never `VITE_LIVEAVATAR_API_KEY`
- Never paste the key into chat, source, README, or tests

## Phase 6A scope

- Optional Start avatar → video session
- Validated text displayed first; speech attempted independently
- Browser **Talk** mic uses Web Speech API → same `/api/chat` pipeline → avatar speaks the validated reply (does not enable LiveAvatar native voiceChat LLM)
- Static Maya avatar remains the fallback
- Adaptive speaking pace → Groq TTS `speed` in LITE (FULL still uses session voice_settings)
- Listening pose via `startListening` / `stopListening` around user turns
- LITE speech via Groq Orpheus TTS when `GROQ_API_KEY` is set
- Sandbox default for development; see [`LIVEAVATAR_CREDIT_BUDGET.md`](./LIVEAVATAR_CREDIT_BUDGET.md)

## Phase 6B (future)

- LiveAvatar native voiceChat / push-to-talk duplex
- Server-side STT provider

See also:

- [`LIVEAVATAR_ARCHITECTURE.md`](./LIVEAVATAR_ARCHITECTURE.md)
- [`ADAPTIVE_EMBODIMENT_POLICY.md`](./ADAPTIVE_EMBODIMENT_POLICY.md)
