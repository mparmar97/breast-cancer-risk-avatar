# Decisional conflict and decision support

## Purpose

After a demonstration breast-cancer risk result, users may experience
contributors to decisional conflict: missing information, unclear options,
unclear preferences, low confidence, insufficient support, or practical /
emotional barriers. This prototype estimates those needs temporarily to
support **decision preparedness**, not to score decisional conflict with a
validated instrument.

## What the layer tracks

`DecisionSupportState` (see `worker/decisionSupport/types.ts`) stores:

- decision topic and stage
- primary and secondary decisional needs
- expressed preferences
- selected option
- unresolved question
- decision confidence
- draft acceptance and action timing

These are temporary conversational estimates. They are not psychological
diagnoses, clinical assessments, validated decisional-conflict scores, or
personality classifications.

## Ottawa Decision Support Framework constructs (inspired)

Deterministic strategies map needs to communication objectives:

| Need / situation | Strategy | Objective |
|---|---|---|
| Missing information | provide_information | Explain the result in plain language |
| Unclear options | clarify_options | Offer neutral non-clinical communication options |
| Unclear preferences | clarify_preferences | Help the user clarify what fits them |
| Low confidence | build_confidence | Support capability without coercion |
| Insufficient support | prepare_questions | Draft help / question preparation |
| Practical barrier | address_barrier | Work around a practical obstacle |
| Emotional barrier | acknowledge_emotion_need | Brief acknowledgment without replacing a primary request |
| Deferral | support_deferral | Respect waiting without pressure |
| Action confirmed | confirm_selected_action | Recognize commitment without re-asking timing |

## Boundaries

The application must not determine:

- whether treatment is needed
- which treatment is appropriate
- whether medication should be taken
- whether a specific screening procedure is required
- whether an appointment is medically necessary
- whether cancer is present

The application is designed to address contributors to decisional
conflict and improve decision preparedness. Clinical effectiveness has
not been established.

## Selected-option memory

If the user selects a portal message (or similar optional approach), that
choice is preserved across later turns so the system can move to drafting
or action confirmation instead of re-asking which option to choose.

## Related docs

- [`NOVELTY_AND_RESEARCH_GAP.md`](./NOVELTY_AND_RESEARCH_GAP.md)
- [`PROJECT_INNOVATION_SUMMARY.md`](./PROJECT_INNOVATION_SUMMARY.md)
- [`CONTRIBUTION_MATRIX.md`](./CONTRIBUTION_MATRIX.md)
