# Project innovation summary

## Problem

Breast-cancer risk calculators often return a percentage that is hard to
interpret and may leave users unsure what optional next step, if any, to
take. Static explanations rarely adapt when understanding, emotion,
barriers, preferences, or confidence change turn by turn.

## Research gap

Limited research has examined this specific combination following a
breast-cancer risk-calculator result.

## Proposed solution

An evidence-grounded decision-support prototype with an explicit
**adaptive orchestration layer**:

risk result → current-turn interpretation → adaptive-state transition →
decisional-needs estimation → deterministic theory-based strategy
selection → dialogue-turn planning → vetted medical RAG → dynamic Groq
wording → grounding/safety/progression/repetition validation →
conversational delivery (text now; LiveAvatar later).

## Adaptive orchestration architecture

Implemented under `worker/orchestration/`:

- `orchestrateDialogueTurn.ts` — fixed pipeline order
- `validateOrchestration.ts` — integrated validation metadata
- `innovationMetadata.ts` — developer/documentation capability tags
- `buildOrchestrationSummary.ts` — compact turn summary

The LLM does not independently control the pipeline.

## Theory operationalization

- Fuzzy-Trace Theory — probability vs diagnosis, gist, horizons, teach-back
- Health Belief Model — barriers, benefits, self-efficacy, cues to action
- Motivational Interviewing principles — reflection, autonomy, open questions
- Readiness-to-change — considering / preparing / action intention
- Ottawa Decision Support Framework–inspired constructs — missing
  information, unclear options/preferences, confidence, support, barriers,
  preparation for shared decision-making

Theory sets the objective, not a fixed sentence.

## Decision-support contribution

Temporary decisional-needs estimates help users understand the result,
clarify options and preferences, preserve a selected communication
option, prepare a draft, confirm an action, or defer without pressure.
The system does not make the medical decision.

## Safety and evidence controls

- Fixed safety overrides for diagnosis, treatment, urgent symptoms,
  emotional crisis, and out-of-scope requests
- Medical claims only from retrieved vetted sources
- Answer-first, unsupported-assumption, progression, and repetition checks
- Local grounded fallback when generation fails

## Expected prototype contribution

Prior systems have separately used breast-cancer risk tools,
personalized decision aids, intelligent tutors, conversational agents,
behavioral theory, and source-controlled medical information. This
prototype integrates these capabilities through an adaptive
orchestration layer that identifies changing conversational and
decisional needs, selects an explicit theory-based communication
objective, retrieves vetted evidence, dynamically generates a response,
and validates medical safety and conversational progression before
avatar delivery.

## Limitations

- Educational prototype only
- Not clinically proven or medically validated
- Does not replace a healthcare professional
- Does not guarantee reduced decisional conflict or follow-up
- LiveAvatar delivery is not yet implemented
- Requires future empirical evaluation

## Future evaluation

A user study should measure comprehension, decision preparedness,
acceptability, safety incident rates, and whether orchestration
metadata predicts useful conversational progress — without treating
prototype estimates as clinical scores.
