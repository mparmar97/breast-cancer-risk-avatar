# Contribution matrix

Cautious project-level comparison of capabilities. This is not a claim that
any capability was “never done before.”

| Project capability | Prior capability exists separately? | How this project integrates it |
|---|---|---|
| Breast-cancer risk estimate | Yes — calculators and official docs | Uses a demonstration risk result as the conversation entry point |
| Plain-language gist explanation | Yes — FTT / BRCA Gist literature | Operationalizes gist via deterministic clarify-risk strategy + dynamic wording |
| Natural-frequency explanation | Yes — risk-communication guidance / NCI framing | Grounded in vetted medical-RAG chunks when retrieved |
| Conversational-state adaptation | Limited exact matches identified in the selected source set | Multidimensional turn estimates (intent, understanding, emotion, barrier, efficacy, readiness, safety) |
| Emotional-response adaptation | Yes — MI / ECA literature | Emotion affects tone; current-turn evidence prevents stale emotion from overriding new requests |
| Perceived-barrier adaptation | Yes — HBM / MI | Deterministic barrier exploration with barrier-clearing transitions |
| Self-efficacy adaptation | Yes — HBM | Support-self-efficacy strategy and confidence language |
| Readiness adaptation | Yes — readiness-to-change framing | Readiness tracked and used without labeling users pejoratively |
| Decisional-needs estimation | Prior decision aids exist separately | ODSF-inspired temporary needs layer after the risk result |
| Option and preference clarification | Prior decision aids exist separately | Neutral options + preference capture without making the medical decision |
| Selected-option memory | Integrated differently across systems | Persists selected communication option across turns |
| Evidence-grounded generation | Source-controlled systems exist | Medical claims only from retrieved vetted chunks |
| Deterministic theory policy | Theory-informed interventions exist separately | Explicit inspectable theory→strategy map; LLM does not choose strategy |
| Dynamic LLM wording | Conversational agents exist | Groq wording under deterministic plans + local fallback |
| Progression validation | Underexplored combination in the selected source set | Dialogue-progression and repetition checks with one repair |
| Safety override | Safety layers exist in health chatbots | Fixed responses for diagnosis/treatment/urgent/crisis/out-of-scope |
| Avatar delivery | Avatar/ECA systems exist | Text delivery now; LiveAvatar planned as delivery mode |

## Contribution statement

The prototype’s distinctive contribution is its adaptive orchestration
layer. It separates conversational-state interpretation, decisional-needs
support, behavioral-theory strategy selection, medical evidence
retrieval, dynamic language generation, and deterministic safety
validation.

The application is designed to address contributors to decisional
conflict and improve decision preparedness. Clinical effectiveness has
not been established.
