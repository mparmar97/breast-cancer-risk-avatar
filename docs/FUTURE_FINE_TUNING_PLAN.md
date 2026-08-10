# Future Fine-Tuning Plan

This prototype uses **structured semantic classification + dynamic generation**.
Fine-tuning is intentionally **not** implemented here.

## Goal

If fine-tuning is introduced later, target **structured semantic classification**, not memorized assistant responses.

Do **not** train the model to emit fixed full-sentence replies for known prompts.
Do train (or adapt) a classifier / structured decoder that emits a `SemanticTurn`, memory updates, information-source choice, and a `ResponsePlan`.

## Why not response memorization

- Exact phrase matching and canned answers fail on paraphrases.
- The dialogue goal changes turn-by-turn; a memorized reply reopens stale topics.
- Safety boundaries, calculator metadata, and deterministic calculations must stay outside free-form generation.

## Recommended training record

Each supervised example should contain:

| Field | Role |
| --- | --- |
| `recentContext` | Short prior user/assistant turns (sanitized) |
| `latestUserMessage` | Current turn text only |
| `semanticTurnTarget` | Gold `SemanticTurn` (topic, operation, stance, evidence-backed emotion/barrier/misunderstanding) |
| `conversationMemoryUpdates` | Diff or next-state facts (`understoodConcepts`, `activeBarrier`, `draftStatus`, `actionStatus`, pending item, etc.) |
| `correctInformationSource` | One or more of: `calculator_metadata`, `deterministic_calculation`, `medical_rag`, `conversation_memory`, `safety_policy` |
| `responsePlanTarget` | Gold `ResponsePlan` (`primaryGoal`, `mustAddress`, `mustNotDo`, `informationSources`, question policy) |

Optional evaluation-only fields (not generation targets):

- `routePriorityNotes` — which priority rule won (safety → direct question → operation → …)
- `forbiddenMoves` — stale-plan / invent-emotion / generic-risk-fallback flags

## Pipeline position

Fine-tuning should replace or strengthen only:

1. structured SemanticTurn interpretation
2. (optionally) ResponsePlan field prediction

It must **not** replace:

- deterministic safety pre-check
- deterministic natural-frequency calculation
- calculator metadata lookup
- vetted RAG retrieval
- semantic / grounding / progression validation
- fixed safety-boundary wording for diagnosis, treatment, crisis, privacy

## Data rules

- Every non-neutral emotion, barrier, misunderstanding, preference, or commitment label must have supporting language in `latestUserMessage` or a contextually resolved short reply.
- Use `not_expressed` / `none` when evidence is absent.
- Keep failed production prompts as **tests**, not as production phrase matchers.
- Prefer paraphrase sets that share meaning but differ in wording.

## Success criteria (future)

- High agreement on topic + primaryOperation on held-out paraphrases
- Low unsupported emotion/barrier inference rate
- Low stale-plan reuse rate when the latest request changes
- Dynamic replies still pass semantic validation without exact-string equality to any training reply

## Out of scope for this prototype

- Model fine-tuning jobs
- Training data export pipelines
- Serving a custom classifier checkpoint
