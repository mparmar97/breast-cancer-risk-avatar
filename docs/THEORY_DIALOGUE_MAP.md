# Theory → Strategy → Dialogue Map (Phase 3)

This document explains how each dialogue strategy in
`worker/behavioral/policy.ts` is grounded in an established health-behavior
or communication theory, how the policy priority order is derived, and why
safety rules always take precedence over behavioral strategy.

## Strategy selection priority

`selectDialogueStrategy()` in `worker/behavioral/policy.ts` evaluates the
`AdaptiveState` in a **fixed priority order**, from most to least urgent:

1. `emotional_crisis` → `urgent_referral`
2. `urgent_symptom` → `urgent_referral`
3. `diagnosis_request` or `treatment_request` → `safety_boundary`
4. `understanding` is `incorrect` or `partial` → `clarify_risk`
5. `emotion` is `overwhelmed` or `worried` → `acknowledge_emotion`
6. `barrier` is anything other than `none` → `explore_barrier`
7. `selfEfficacy` is `low` → `support_self_efficacy`
8. `readiness` is `preparing` or `ready` → `action_planning`
9. Otherwise → `explore_readiness`

### Why this order?

- **Safety first, always.** Steps 1–3 are evaluated before anything else
  and unconditionally short-circuit the rest of the function. A user in
  crisis, reporting an urgent symptom, or asking for a diagnosis/treatment
  must never be routed into ordinary behavior-change coaching — the
  potential harm of mishandling those cases outweighs any behavioral
  consideration.
- **Correcting a misunderstanding comes before addressing emotion or
  barriers**, because Fuzzy-Trace Theory research on risk communication
  finds that a clear "gist" understanding of what a probability means is
  foundational — trying to motivate action on top of a misunderstood risk
  (e.g. believing a risk estimate is a diagnosis) can backfire.
- **Emotion is addressed before barriers or action-planning.** A worried or
  overwhelmed user is unlikely to engage productively with logistics
  (barriers) or planning until their emotional state has been acknowledged
  — consistent with Motivational Interviewing's emphasis on meeting the
  person where they are before moving toward change talk.
- **Barriers are addressed before self-efficacy or action-planning**,
  because an unaddressed concrete barrier (e.g. cost, access) will block
  action regardless of how capable the person otherwise feels.
- **Readiness/action-planning is the last, most "ready" strategy.** It
  should only be reached when there is no unresolved safety, understanding,
  emotional, or barrier issue in the way.

This is why, in the example from the Phase 3 specification, *"I am scared
but I will call tomorrow"* resolves to `acknowledge_emotion` (priority 5)
rather than `action_planning` (priority 8) — emotion is checked, and
matched, first.

## Strategy → Theory mapping

| Strategy                | Theory                                             | Construct                                   | Communication technique                              | Objective                                                     |
| ------------------------| ----------------------------------------------------| ---------------------------------------------| -------------------------------------------------------| ----------------------------------------------------------------|
| `clarify_risk`          | Fuzzy-Trace Theory                                  | Essential (gist) meaning of risk             | Plain language and teach-back                          | Distinguish probability from diagnosis                          |
| `acknowledge_emotion`   | Motivational Interviewing communication principles  | Reflective listening and autonomy support    | Reflection and open-ended question                     | Acknowledge emotion without increasing fear                     |
| `explain_benefit`       | Health Belief Model                                 | Perceived benefits                           | Permission-based explanation                            | Explain the value of appropriate professional follow-up         |
| `explore_barrier`       | Health Belief Model                                 | Perceived barriers                           | Open-ended barrier exploration                          | Identify the main obstacle without judgment                     |
| `support_self_efficacy` | Health Belief Model                                 | Self-efficacy                                | Manageable choices                                      | Help the user identify a feasible first step                    |
| `action_planning`       | Health Belief Model                                 | Cue to action                                | Autonomy-supportive action planning                     | Help the user select one concrete next step                     |
| `explore_readiness`     | Readiness-to-change framework                       | Readiness and ambivalence                    | Open-ended question                                     | Understand how the user currently feels about follow-up         |
| `safety_boundary`       | Medical risk-communication safety                   | Scope and role boundary                      | Clear non-diagnostic statement                          | Prevent diagnosis and treatment advice                           |
| `urgent_referral`       | Medical communication safety                        | Escalation beyond application scope          | Concise recommendation for immediate human support      | Avoid unsafe management of urgent symptoms or crisis             |

`explain_benefit` is defined in the type system and theory map for
completeness (and potential future use), but the current priority algorithm
in step 9 above does not route to it directly — it is reserved as a
selectable strategy for future refinement of the policy.

### How Health Belief Model constructs are operationalized

The Health Belief Model (HBM) proposes that health behavior is shaped by
perceived barriers, perceived benefits, self-efficacy, and cues to action.
In this engine:

- **Perceived barriers** → `explore_barrier`, triggered whenever the
  classifier detects a stated obstacle (`fear`, `time`, `cost`, `access`,
  `mistrust`, `uncertainty`, or `other`). The generated response is
  tailored to the specific barrier (see `worker/llm/localGenerator.ts`),
  asking one open-ended question about that obstacle rather than assuming
  what it is.
- **Self-efficacy** → `support_self_efficacy`, triggered when the user
  expresses low confidence in navigating next steps (e.g. not knowing who
  to contact). The response offers small, concrete, low-effort options
  rather than a large or vague action.
- **Cue to action** → `action_planning`, triggered once the user is
  `preparing` or `ready`. The response reinforces the identified next step
  and invites the user to name what feels realistic — without pressuring a
  specific action.
- **Perceived benefits** → `explain_benefit`, for explaining why
  professional follow-up is worthwhile (reserved for future policy
  refinement, as noted above).

### How Fuzzy-Trace Theory is operationalized

Fuzzy-Trace Theory distinguishes between verbatim detail (the exact
percentage) and "gist" — the simple, essential meaning of a risk. The
`clarify_risk` strategy is triggered when the classifier detects an
`incorrect` or `partial` understanding (most commonly, treating a risk
estimate as equivalent to a diagnosis). Its response deliberately avoids
restating more numeric detail and instead re-anchors the gist ("a risk
estimate describes probability... it does not mean you currently have
breast cancer") before inviting the user to explain the meaning back
(a lightweight teach-back technique).

### How Motivational Interviewing techniques are used

`acknowledge_emotion` uses two core Motivational Interviewing techniques:

- **Reflection** — naming the emotional experience implied by the message
  ("it sounds like seeing this result has been worrying") without judgment
  or minimization.
- **Open-ended question** — inviting the user to elaborate on what
  concerns them most, which supports autonomy rather than directing the
  conversation.

Critically, the engine never attempts to label or diagnose the emotion
clinically (e.g. it never says "you have anxiety") — it only reflects the
tone of the specific message back to the user in plain language.

## Why safety overrides behavioral strategy

Steps 1–3 of the priority order exist precisely so that a safety-relevant
message can never be handled by a behavior-change strategy. Concretely:

- A user asking *"Which medication should I take?"* must always receive
  `safety_boundary`, even if the same message also expresses readiness to
  act — recommending or implying a treatment decision is out of scope and
  potentially harmful, regardless of the user's motivational state.
- A user reporting an urgent symptom (e.g. a new lump, bleeding) or a
  statement suggesting emotional crisis must always receive
  `urgent_referral`, directing them to appropriate human/professional
  support, rather than being kept in a scripted behavior-change
  conversation that this application is not equipped to safely conduct.

This ordering, combined with the independent, always-fresh (never-cached)
safety classification described in `docs/ADAPTIVE_STATE_MODEL.md`, and the
final `validateResponse()` content check in
`worker/safety/validateResponse.ts`, forms three independent layers of
protection against unsafe output.
