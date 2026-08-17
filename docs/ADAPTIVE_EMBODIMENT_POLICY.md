# Adaptive Embodiment Policy

## Principle

Adaptive state may influence **how** a validated response is delivered
(tone, pace, energy, presence). It must never change **what** factual or medical
content is spoken.

Theory (HBM, Fuzzy-Trace, Motivational Interviewing) selects communication
strategy in the dialogue engine. Theory does **not** directly map to
provider facial morphs (LiveAvatar has no set-expression API).

```
AdaptiveState (+ current-turn evidence)
        ↓
EmbodimentPolicy (tone / pace / energy / avatarExpression)
        ↓
Provider adapter (voice affect + listening pose + UI presence)
        ↓
LiveAvatar FULL
```

## Policy fields

- `deliveryTone`: `neutral` | `warm` | `supportive`
- `speakingPace`: `normal` | `slightly_slow`
- `responseEnergy`: `neutral` | `gentle` | `positive`
- `avatarExpression`: `neutral` | `attentive` | `reassuring` | `gentle` | `encouraging`
- Explicit facial / gesture morph flags mirror provider capabilities
  (currently `false` / `false` for LiveAvatar — no dynamic face morph API)

## LiveAvatar delivery adapters

| Policy cue | LiveAvatar behavior |
|------------|---------------------|
| `speakingPace` / `avatarExpression` | FULL `voice_settings.speed` with wide contrast: reassuring/gentle ≈ **0.80–0.82**, attentive ≈ **0.95**, neutral **1.0**, encouraging ≈ **1.15**. Also `style` / `stability` (large deltas). Session recreates when settings change. |
| Listening pose | `avatar.start_listening` / `avatar.stop_listening` around user turns; supportive cues stay attentive after speak. |
| Facial morph | Not available — capability flags stay false. |

## Example mappings

| Case | Evidence | Policy |
|------|----------|--------|
| A | understanding `uncertain`, emotion not expressed | neutral / normal / **attentive** |
| B | emotion `worried` with explicit evidence | supportive / slightly_slow / **reassuring** |
| C | understanding `correct`, self-efficacy improving with evidence | warm / normal / **encouraging** |
| D | emotion frustration / dismissive with evidence | avoid exaggerated positive; gentle / **gentle** |

Emotion is never inferred solely to change avatar delivery — current-turn
evidence must support the cue.

## Integrity

`AvatarDeliveryRequest` always carries:

- `assistantTurnId`
- `validatedText` (exact written reply)

TTS may adjust pronunciation formatting only if semantic content remains
identical. No second LLM rewrite is allowed in the delivery path.
