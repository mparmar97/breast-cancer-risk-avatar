# General Dynamic Multi-Turn Dialogue Manager

## Adaptive orchestration contribution

The prototype’s distinctive contribution is its adaptive orchestration
layer (`worker/orchestration/`). It separates conversational-state
interpretation, decisional-needs support, behavioral-theory strategy
selection, medical evidence retrieval, dynamic language generation, and
deterministic safety validation.

The application is designed to address contributors to decisional
conflict and improve decision preparedness. Clinical effectiveness has
not been established.

Normal conversational wording is dynamically generated. Scripted text
is reserved for safety boundaries and fallback behavior.

The application estimates temporary conversational needs. It does not
diagnose a psychological condition.

## Why one-off scripted responses were insufficient

Earlier phases could answer common risk questions safely, but multi-turn conversation still behaved like a script bank: greetings triggered unnecessary risk explanations, short replies such as “yes” were misread without the prior question, old emotions overrode new requests, barriers lingered after they were resolved, and practical drafting help was reduced to emotional reflection. Normal conversational wording therefore needed to be **dynamically generated**, while theory selection, medical grounding, and safety boundaries stayed deterministic.

## Current-turn interpretation

Each turn is interpreted as a structured `CurrentTurnInterpretation` (Groq when available; local classifier otherwise). The latest user message has priority. Supporting phrases live in `currentTurnEvidence` and are **not** the intent label. The developer panel shows both separately.

## Multiple-intent handling

A message may carry a primary intent plus secondary intents (for example worry plus a next-step question). The deterministic policy fulfills the primary request first; secondary intents may only affect tone.

## Evidence-consistency validation

Labels must agree with their evidence phrases. If emotion evidence is “not expressed,” emotion must be neutral. Conflicts trigger one structured repair, then local fallback. Metadata: `classificationConsistency`, `classificationRepairUsed`.

## Short-reply resolution

`resolveShortReply` interprets short affirmations/negations against the pending item (comprehension check, offered option, teach-back, proposed draft, action commitment). A bare “yes” after a statement that was not a clear question requires clarification rather than inventing a plan.

When a proposed draft is pending, `resolvePendingDraft` also recognizes pasted or paraphrased draft bodies and explicit wording-review questions so they are not misclassified as new medical or emotional disclosures.

## State transitions

`transitionState` merges previous state with current evidence and short-reply overrides. Barriers expire when unmentioned; informational questions do not reduce readiness; greetings/closings do not inherit stale worry or access barriers; confirming understanding improves understanding without forcing readiness to “ready.”

## Deterministic theory policy

Groq never picks the strategy. Priority favors safety, direct questions, draft help, next-step help, misunderstandings, greetings, confirmed understanding, closings, corrections, then currently expressed emotion/barrier/confidence/action/readiness.

Theories (Fuzzy-Trace Theory, Health Belief Model, Motivational Interviewing principles, readiness-to-change) set the **objective**, not a fixed sentence.

## Dialogue-turn planning

`planDialogueTurn` decides primary/secondary goals, dialogue act, must-address / must-not-assume constraints, question purpose, and the next pending item **before** wording is generated.

## Answer-first behavior

Clear questions and practical requests are answered before any follow-up. The system does not ask the user to restate information already provided, and does not only reflect emotion when a next step or draft was requested.

## Draft handling

`request_draft_help` produces an editable portal-message draft (demonstration estimate, request for interpretation, no diagnosis, no required appointment). `request_draft_review` / `confirm_proposed_action` review clarity without restarting risk education.

## Dynamic response generation

Successful non-safety turns use `responseMode: "groq-dynamic-rag"` with plan-driven generation. Medical claims may come only from retrieved medical-rag evidence. Greetings and closings may omit medical retrieval.

## Medical RAG grounding

Retrieval remains deterministic and limited to vetted `medical-rag` chunks. Theory papers are dialogue-design only and never medical support for a reply.

## Progression validation

`validateDialogueProgression` rejects replies that ignore the primary goal, fail to answer, skip practical help, repeat resolved barriers/explanations, invent appointments, mishandle corrections, or ask more than one question. Metadata includes `dialogueAdvanced`, `primaryGoalSatisfied`, `directQuestionAnswered`, `practicalRequestFulfilled`, `unsupportedAssumptionDetected`, `resolvedIssueRepeated`, `repeatedExplanationDetected`, `userCorrectionHandled`.

## Repetition prevention

The repetition guard compares against the previous five assistant replies and allows one regeneration with an identified repeated move before local fallback.

## Safety overrides

Fixed safety wording remains for diagnosis/treatment boundaries, urgent symptoms, emotional crisis, and out-of-scope cases. Groq generation is not used on those turns.

## Local fallback

Missing configuration, provider failure, invalid structured output, failed repair, or persistent repetition uses local grounded templates that still advance the current goal.

## Limitations

- The application estimates temporary conversational needs. It does not diagnose a psychological condition.
- Normal conversational wording is dynamically generated. Scripted text is reserved for safety boundaries and fallback behavior.
- Local classification is a thin heuristic; varied natural language is primarily handled by Groq structured interpretation when configured.
- Progression and repetition checks are heuristic and prefer false negatives over discarding a good reply.
- Demonstration risk results are not clinically validated personal assessments.
