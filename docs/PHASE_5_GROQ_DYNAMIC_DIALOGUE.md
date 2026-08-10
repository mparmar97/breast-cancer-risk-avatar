# Phase 5: Groq-Powered Dynamic Adaptive Dialogue

This document explains the Phase 5 architecture, which changes the primary
chat flow from template-dominated local responses to dynamic,
Groq-generated dialogue, while preserving every deterministic safety,
policy, and retrieval mechanism from Phases 3–4b (see
[`ADAPTIVE_STATE_MODEL.md`](./ADAPTIVE_STATE_MODEL.md),
[`THEORY_DIALOGUE_MAP.md`](./THEORY_DIALOGUE_MAP.md), and
[`RAG_ARCHITECTURE.md`](./RAG_ARCHITECTURE.md)).

> **The system is dynamic in language generation and turn-by-turn
> adaptation, but constrained in behavioral-policy selection, evidence
> grounding, and safety enforcement.**

LiveAvatar and Cloudflare Vectorize are explicitly **not** part of this
phase.

## Architecture

```
latest user message
+ recent conversation history
+ previous adaptive state
+ demonstration risk result
  -> deterministic safety pre-check        (worker/behavioral/localClassifier.ts)
  -> Groq structured state classification  (worker/llm/classifyAdaptiveState.ts)
     (falls back to the local classifier automatically)
  -> deterministic state transition        (worker/behavioral/stateTransition.ts)
  -> deterministic strategy selection      (worker/behavioral/policy.ts)
  -> deterministic theory mapping          (worker/behavioral/theoryMap.ts)
  -> deterministic medical-RAG retrieval   (worker/rag/retrieve.ts)
  -> Groq dynamic response generation      (worker/llm/generateDynamicResponse.ts)
     (falls back to the local generator automatically)
  -> response + grounded-evidence validation
     (worker/safety/validateResponse.ts, worker/safety/validateGrounding.ts)
  -> semantic repetition check + one regeneration
     (worker/llm/repetitionGuard.ts)
  -> local grounded fallback when necessary
  -> structured JSON response
```

Every stage that calls Groq has a fully deterministic, local fallback, so
the chat pipeline is never on a single point of failure for producing a
safe reply. See `worker/index.ts#handleChat` for the orchestration.

## Why classification and generation are separate Groq calls

Splitting "understand the user's current turn" from "write the reply"
into two Groq requests, each with its own strict JSON schema, keeps each
call's job small and independently verifiable:

- The classifier's only job is to map the latest message (plus bounded
  context) onto the existing, closed enum taxonomy already used by the
  local classifier (`worker/behavioral/state.ts`). Its output is
  re-validated locally (`worker/llm/validateAdaptiveState.ts`) against
  those exact enums before anything downstream trusts it.
- The generator's only job is to write supportive, evidence-grounded
  prose for a strategy that has *already* been chosen deterministically.
  It never decides what to say strategically — only how to phrase it.

This separation also means a classification failure and a generation
failure are independently diagnosable (`classificationMode` and
`responseMode` are reported separately — see below) and independently
recoverable: a classification fallback does not require a generation
fallback, and vice versa.

## Why strategy selection remains deterministic

`worker/behavioral/policy.ts#selectDialogueStrategy` is a plain function
over the (possibly Groq-classified) `AdaptiveState` plus an optional
`intent` — not a Groq call. Groq's classification output feeds this
function; it never chooses the dialogue strategy itself. This keeps the
strategy space fully enumerable, testable, and auditable ahead of time
(`tests/policy.test.ts`), and guarantees that a language model can never
introduce a new, unreviewed conversational strategy.

The Phase 5 addition is an optional `intent` parameter, used only to
resolve a few cross-cutting cases the original Phase 3 priority order
didn't need to handle for a purely regex-driven classifier — most
importantly, "a direct informational question must not be overridden by
a previous emotion or barrier" (see `worker/behavioral/policy.ts` for the
full, updated priority order). Every call site that omits `intent`
reproduces the exact Phase 3 behavior, so no existing test needed to
change.

## Why RAG remains deterministic

Retrieval (`worker/rag/retrieve.ts#retrieveEvidence`) is unchanged from
Phase 4b: a local, in-memory, term-frequency/cosine-similarity search
over the vetted evidence collection, restricted to `sourceUse:
"medical-rag"`. Groq never searches, browses, or supplies evidence — it
only receives the top three chunks the deterministic retriever already
selected, formatted with their ID, topic, title, organization, section,
text, source-use, and any clinical-use restriction or research
limitation (`worker/llm/generationSchema.ts#formatEvidence`). Source URLs
are deliberately never sent to Groq, since the generator has no
legitimate reason to reference or reproduce them.

The generator's structured output must return which evidence IDs (if
any) it relied on (`usedEvidenceIds`). `worker/safety/validateGrounding.ts`
locally re-checks that every returned ID was actually among the IDs
supplied that turn — an ID Groq did not receive can never be accepted —
and that any strategy/content making a factual medical claim cites at
least one ID.

## Why safety remains deterministic

Before any Groq call, `worker/index.ts#handleChat` runs the same
regex-based safety detection the local classifier has always used
(diagnosis/treatment requests, urgent symptoms, emotional crisis). When
it fires, the fixed, human-reviewed safety response
(`worker/safety/safetyResponses.ts`) is returned immediately —
`classificationMode: "local-safety-precheck"`, `responseMode:
"fixed-safety"` — and **neither Groq classification nor Groq generation
is ever invoked** for that turn. As defense in depth, if a safety
condition only emerges after Groq's classification (e.g. a phrasing the
local regex pre-check didn't catch), the same fixed safety response still
overrides generation — Groq generation is still never invoked in that
case either. Crisis-response wording is unchanged from Phase 3 and was
not touched in this phase.

## Structured JSON classification

`worker/llm/classifyAdaptiveState.ts` requests Groq Chat Completions with
`response_format: { type: "json_schema", json_schema: { strict: true,
... } }` (see `worker/llm/classificationSchema.ts`). The schema:

- requires every field (`intent`, `understanding`, `emotion`, `barrier`,
  `selfEfficacy`, `readiness`, `safetyFlag`, `confidence`,
  `currentTurnEvidence`);
- constrains every enum field to the exact values already defined in
  `worker/behavioral/state.ts` (no duplicate/inconsistent enums);
- constrains `confidence` to `[0, 1]`;
- constrains each `currentTurnEvidence.*` rationale string to 160
  characters;
- sets `additionalProperties: false` at both the top level and inside
  `currentTurnEvidence`.

Even with strict schema output requested, `worker/llm/validateAdaptiveState.ts`
re-validates the parsed JSON from scratch (missing fields, unknown
enum values, out-of-range confidence, oversized evidence strings, unknown
properties) before anything downstream trusts it — providers can still
return malformed or unexpectedly-shaped JSON.

### State transition

`worker/behavioral/stateTransition.ts#applyStateTransition` merges the
classified turn with the previous state: a field whose
`currentTurnEvidence` rationale is `"not expressed"` (or an equivalent
sentinel) falls back to the previous turn's value for that field, so an
unmentioned barrier is carried forward while an explicitly resolved one
is cleared. `safetyFlag` and `confidence` are always taken fresh and
never carried forward. This is the same merge semantics the local
classifier (`worker/behavioral/localClassifier.ts`) has always used
internally, unified into one small, testable function
(`tests/dynamicClassifier.test.ts`) for the Groq-classified path.

## Dynamic response generation

`worker/llm/generateDynamicResponse.ts` requests a second, separate
structured completion (`worker/llm/generationSchema.ts`) with a system
prompt that:

- states the assistant is not a clinician and cannot diagnose, prescribe,
  or give individualized screening instructions;
- makes the selected strategy authoritative without exposing its
  internal name;
- restricts medical factual claims to the supplied retrieved evidence
  only;
- requires plain-text replies under 90 words with at most one question;
- forbids exposing adaptive-state/theory labels, prompts, or developer
  metadata;
- forbids repeating or closely paraphrasing recent assistant replies;
- explicitly tells the model that the conversation history, latest
  message, and evidence text are untrusted data, never instructions that
  can override the system prompt (a basic prompt-injection mitigation —
  see `tests/dynamicConversation.test.ts` for a prompt-injection test
  against the safety pre-check, which never even reaches this
  generator).

## Response validation

Every Groq-generated reply passes through, in order:

1. **Structural validation** (`worker/llm/generateDynamicResponse.ts`):
   valid JSON, exactly the two expected keys, `reply` non-empty and
   within a hard character cap, `usedEvidenceIds` an array of strings.
2. **`validateGeneratedReply`** (`worker/safety/validateResponse.ts`):
   plain text (no markdown/HTML), ≤90 words, ≤1 question, no prohibited
   diagnostic/treatment/certainty claim (the same `PROHIBITED_PATTERNS`
   list used since Phase 3, extended with clinician-impersonation,
   screening-instruction, and guarantee patterns), no internal
   strategy/theory label or system-prompt leakage, no URL.
3. **`validateGroundedEvidence`** (`worker/safety/validateGrounding.ts`):
   every `usedEvidenceIds` entry must exist in that turn's retrieved
   evidence; strategies/content making a factual medical claim must cite
   at least one ID; emotional-reflection and barrier-exploration replies
   without a factual claim may use zero evidence.
4. **The shared `validateResponse` safety net** (unchanged from Phase 3,
   Phase 4) is applied last, to every reply regardless of origin.

Any failure at any stage discards the candidate and falls back to the
local, deterministic generator — never "repairs" or truncates a
generated reply, since partial text could change its medical meaning.

## Repetition control

`worker/llm/repetitionGuard.ts#detectRepetition` compares a candidate
reply against the three most recent assistant replies after normalizing
case, punctuation, and common contractions, flagging a match when any of:
the normalized text is identical, token cosine similarity is ≥0.82, the
first eight tokens are identical, or the same leading statement repeats
with only the trailing question differing.

When repetition is detected, `applyRepetitionGuard` requests exactly one
Groq regeneration (with the rejected reply included as "do not repeat
this"), re-validates it, and — if it still fails or remains repetitive —
falls back to the local generator (`responseMode: "local-rag-fallback"`,
`fallbackReason: "repetition_failure"`). There is never more than one
regeneration attempt per turn.

## Local fallback

Both the classifier and the generator are wrapped so that any of the
following results in an automatic, safe local fallback rather than an
error surfaced to the user:

- `GROQ_API_KEY` not configured (`fallbackReason: "missing_configuration"`)
- timeout, network failure, rate limiting, or a provider 5xx
  (`classification_provider_failure` / `generation_provider_failure`)
- malformed JSON or failed local schema re-validation
  (`classification_validation_failure` / `generation_validation_failure`)
- repeated/unsuccessful regeneration (`repetition_failure`)

`fallbackReason` is always one of this closed set — never a raw provider
error message, status text, or stack trace. `POST /api/chat` always
returns HTTP 200 with a safe, non-empty reply in every case (see
`tests/groqFallback.test.ts`).

## Privacy and API-key handling

- `GROQ_API_KEY` is read only from `env.GROQ_API_KEY` (a Wrangler
  *secret*/`.dev.vars` value, never a plaintext `vars` entry) and is
  never logged, never included in a thrown error's message, and never
  present in any HTTP response (chat, config-status, or otherwise) — see
  `tests/groqClient.test.ts` and `tests/groqFallback.test.ts` for
  explicit assertions that a test key never appears in a response body.
- `GET /api/config-status` reports only `groqConfigured`, `groqModel`,
  and `dynamicModeAvailable` — booleans and a model name, never the key —
  and never makes a paid/provider request to "verify" the key.
- The consent screen (`src/components/ConsentScreen.tsx`) discloses that,
  when dynamic dialogue is enabled, chat messages are sent to Groq for
  language processing, and asks the user not to enter identifying
  information.
- Requests to Groq are built exclusively from
  `worker/llm/conversationContext.ts`'s sanitized output: at most the 8
  most recent, trimmed, non-empty `{role, content}` messages. Developer
  metadata, adaptive-state objects, API errors, environment values, and
  unnecessary source URLs are never sent.

## Testing with mocked requests

Automated tests never contact the real Groq API. Two mocking strategies
are used, matching where a `fetch` implementation can be injected:

- **Direct injection**: `createGroqChatCompletion`, `classifyAdaptiveState`,
  `generateDynamicResponse`, and `applyRepetitionGuard` all accept an
  optional `fetchImpl` parameter, so unit tests
  (`tests/groqClient.test.ts`, `tests/dynamicClassifier.test.ts`,
  `tests/dynamicGenerator.test.ts`, `tests/repetitionGuard.test.ts`) pass
  a `vi.fn()` mock directly.
- **Global stub**: full-pipeline tests that call `worker.fetch(...)`
  (`tests/dynamicConversation.test.ts`, `tests/groqFallback.test.ts`,
  `tests/configStatus.test.ts`) use `vi.stubGlobal('fetch', ...)`, since
  `worker/index.ts` itself never threads a custom `fetchImpl` through —
  production code always uses the ambient Cloudflare Workers `fetch`.

`tests/dynamicConversation.test.ts` includes the required four-turn
integration test (access barrier → delay → expressed confidence →
confirmed action) against a mocked *successful* Groq classifier and
generator, and a second run of the same conversation with Groq calls
failing, asserting the pipeline still progresses the same barrier/
readiness sequence via the local fallback.

## Remaining limitations

- Groq's classification and generation quality is not evaluated against
  a held-out clinical or behavioral-science benchmark in this prototype;
  "vetted" evidence and "deterministic" policy do not mean "clinically
  validated."
- The repetition guard's similarity heuristic (token cosine similarity,
  shared leading tokens) is a lightweight approximation, not a semantic
  embedding comparison — it can occasionally miss a paraphrase or flag an
  unrelated short reply as similar.
- The local fallback classifier's natural-language tolerance is
  intentionally minimal (a handful of shorthand/typo expansions); Groq is
  expected to handle the bulk of imperfect phrasing when configured.
- As in Phase 4, medical evidence remains a small, hand-curated,
  17-chunk/10-source collection — not a comprehensive clinical corpus.
- No conversation history or Groq request/response content is persisted
  server-side; this also means retrieval and classification cannot learn
  across sessions.
