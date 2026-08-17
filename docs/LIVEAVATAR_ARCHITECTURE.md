# LiveAvatar Architecture

## Split of responsibility

| Layer | Owner |
|-------|--------|
| Medical / dialogue content | Existing Worker orchestration (Phase 5) |
| Embodiment policy (tone/pace) | `worker/embodiment/` |
| TTS | `worker/tts/` (provider-independent) |
| Session token (API key) | Worker `worker/liveavatar/` |
| Video + LITE WebSocket | Browser `@heygen/liveavatar-web-sdk` |
| Static fallback | `src/components/AvatarPanel.tsx` |

## Request paths

```
Browser ──GET /api/liveavatar/config──► Worker (public flags only)
Browser ──POST /api/liveavatar/session/start──► Worker
                                              └── X-API-KEY → LiveAvatar /v1/sessions/token
Browser ◄── sessionToken (short-lived) ──────┘
Browser SDK ── Bearer sessionToken ──► LiveAvatar /v1/sessions/start
Browser SDK ◄── livekit + ws ─────────┘

Validated reply shown in UI
Browser ──POST /api/liveavatar/prepare-speech──► Worker TTS + embodiment
Browser SDK.repeatAudio(pcmBase64) ──► LiveAvatar agent.speak
```

## Failure hierarchy

1. LiveAvatar connected → text + speaking avatar  
2. LiveAvatar / WebRTC / auth fail → text + static avatar  
3. TTS unavailable → text + static avatar (video may still connect)  
4. Groq fail → existing local grounded fallback text; avatar may speak that text only  

LiveAvatar failure ≠ dialogue failure.

## Capabilities (current LITE docs)

| Control | Supported |
|---------|-----------|
| Facial expression API | no |
| Arbitrary gesture API | no |
| Listening / idle pose (`start_listening` / `stop_listening`) | yes (pose) |
| Prosody control via LiveAvatar | no (TTS may encode pace later) |

Do not fabricate unsupported controls.

## Credit protection

- Sandbox default
- Start avatar requires explicit user action
- No LiveAvatar calls from `npm test` / `build` / `typecheck`
- Keep-alive only while a user-started session is active
- Dev max session seconds optional via `LIVEAVATAR_DEV_MAX_SESSION_SECONDS`
