# Adaptive State Model (Phase 3)

## What this is — and what it is not

This document describes the **Adaptive Readiness-to-Action Dialogue Engine**
introduced in Phase 3. On every chat turn, the Cloudflare Worker classifies
the user's message into a small, structured `AdaptiveState`, uses that state
to pick one of nine deterministic dialogue strategies, and returns a
theory-informed, template-based reply together with the full diagnostic
trail.

**This is a heuristic prototype for demonstration and testing purposes. It
is not a diagnostic model.** It does not detect, measure, or claim to
identify any psychological or mental-health condition (e.g. anxiety
disorder, depression, clinical distress). It estimates **temporary
conversational needs for this single reply** — nothing more — using
keyword and pattern matching, entirely on the server, with no external LLM
or network call involved.

The classifications are:

- Never shown inside the normal chat conversation with the user.
- Only ever surfaced in a clearly labeled, collapsible **developer
  diagnostics panel**, alongside an explicit note that they are not
  psychological diagnoses.
- Recomputed independently on every turn — nothing is persisted
  server-side between requests (see "Statelessness" below).

## The `AdaptiveState` shape

Defined in `worker/behavioral/state.ts` (mirrored in `src/types.ts` for the
frontend):

| Field          | Type                                                                                          | Meaning                                                              |
| -------------- | ----------------------------------------------------------------------------------------------| --------------------------------------------------------------------|
| `understanding`| `correct \| partial \| incorrect \| uncertain`                                                | Whether the user's message reflects an accurate grasp of what a risk estimate means. |
| `emotion`      | `calm \| worried \| overwhelmed \| dismissive \| uncertain`                                   | The apparent emotional tone of *this message* — never a clinical mood assessment. |
| `barrier`      | `none \| fear \| time \| cost \| access \| mistrust \| uncertainty \| other`                  | The main practical or emotional obstacle to follow-up mentioned by the user. |
| `selfEfficacy` | `low \| moderate \| high \| unknown`                                                          | The user's apparent confidence in their ability to take a next step. |
| `readiness`    | `not_considering \| considering \| preparing \| ready \| unclear`                             | Readiness-to-change stage suggested by this message. |
| `safetyFlag`   | `none \| diagnosis_request \| treatment_request \| urgent_symptom \| emotional_crisis \| out_of_scope` | A safety-relevant condition that must override ordinary dialogue strategy. |
| `confidence`   | `number`, always clamped to `[0, 1]`                                                          | How confident the deterministic classifier is in this particular estimate. |

`normalizeAdaptiveState()` in `worker/behavioral/state.ts` guarantees every
field is always one of its allowed enum values and that `confidence` is
always within `[0, 1]`, even if given corrupted or partial input (e.g. from
`localStorage` or a malformed request body). This is the single place where
invalid data is sanitized, so no other part of the system needs to trust its
inputs blindly.

The conservative default state — used when nothing else can be inferred —
is:

```json
{
  "understanding": "uncertain",
  "emotion": "uncertain",
  "barrier": "none",
  "selfEfficacy": "unknown",
  "readiness": "unclear",
  "safetyFlag": "none",
  "confidence": 0.4
}
```

## How the local classifier works

`worker/behavioral/localClassifier.ts` normalizes the incoming message
(lowercasing, whitespace collapsing, smart-quote normalization) and applies
independent, deterministic regex rules for each field:

1. **Safety flags are detected first and independently** of every other
   field, in a fixed priority order (crisis → urgent symptom → diagnosis
   request → treatment request). This ensures a safety condition is never
   missed just because some other rule matched first.
2. **Behavioral signals** (understanding, emotion, barrier, self-efficacy,
   readiness) are then detected from the same normalized message.
3. If the current message provides **no signal for a given field**, that
   field falls back to the caller-supplied `previousState` (if any) — or to
   the conservative default otherwise. This provides light continuity
   across a conversation (e.g. a short "ok thanks" doesn't erase a barrier
   mentioned a turn earlier) without ever inventing information that wasn't
   actually said.
4. **`safetyFlag` and `confidence` are always recomputed fresh from the
   current message and are never inherited from `previousState`.** This is
   a deliberate safety property: a safety condition detected on a previous
   turn (e.g. an urgent symptom) can never "leak" into a later, unrelated
   reply just because it was carried over.

No external LLM, RAG system, or network call is used anywhere in this
classification step — the entire pipeline in this phase runs on fixed,
auditable regular expressions.

## Statelessness

Per the Phase 3 requirements, **no chat messages or classifications are
saved server-side.** The Worker is fully stateless between requests. The
frontend is responsible for sending back the `riskResult` and the previous
turn's `AdaptiveState` (as `previousState`) with each new `/api/chat`
request if it wants continuity; the Worker never stores anything itself.

## Confidence

Confidence is a simple, explainable heuristic (not a calibrated
probability):

- Safety-flag detections start at high confidence (`0.9`–`0.92`), since
  these patterns are narrow and specific and a false negative here is the
  primary risk to avoid.
- Any other detected behavioral signal (barrier, emotion, understanding,
  readiness, or self-efficacy) yields a moderate confidence of `0.75`.
- A message that matches none of the deterministic rules keeps the
  conservative default confidence of `0.4` — i.e. the engine explicitly
  reports low confidence rather than guessing.
