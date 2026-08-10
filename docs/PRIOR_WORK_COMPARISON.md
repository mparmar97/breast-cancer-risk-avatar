# Prior-work comparison (project-level)

This comparison is not a systematic review. It is a project-level
comparison based on the selected source set documented in
[`EVIDENCE_REGISTER.md`](./EVIDENCE_REGISTER.md) and
[`design-rationale.md`](./design-rationale.md).

| System or study | Breast-cancer context | Risk calculation | Avatar or embodied agent | Multi-turn dialogue | Behavioral theory | Decisional-needs support | Evidence grounding | Dynamic adaptation | Deterministic safety validation | Limitation relative to this prototype |
|---|---|---|---|---|---|---|---|---|---|---|
| NCI BCRAT / Gail Model documentation (`NCI-BCRAT-*`) | Yes | Yes (official calculator docs) | No | No | No | No | Official calculator documentation | No | N/A (calculator docs, not a dialogue system) | Provides calculation/context, not adaptive post-result conversation |
| NCI risk-tool patient education (`NCI-RISK-TOOLS-2024`) | Yes | Explains tools | No | No | Risk-communication framing | Limited (professional interpretation) | Government patient education | No | N/A | Static education content, not turn-by-turn orchestration |
| USPSTF breast-cancer screening 2024 | Yes (screening) | No | No | No | Guideline context | Shared decision context only at guideline level | Clinical guideline | No | N/A | Not a conversational decision-support agent after a calculator result |
| Reyna 2008 Fuzzy-Trace Theory (`REYNA-FTT-2008`) | Medical decision making | Theory for risk gist | No | Theory informs dialogue design | Fuzzy-Trace Theory | Decision-making theory, not ODSF implementation | Theory paper | Conceptual | N/A | Theory source, not an integrated runtime system |
| Wolfe et al. 2015 BRCA Gist (`WOLFE-BRCA-GIST-2015`) | Genetic breast-cancer risk education | Tutoring around genetic risk | Web ITS / avatar-related tutoring context | Tutorial dialogues | Fuzzy-Trace Theory | Comprehension-focused | Research system | Adaptive tutoring within study scope | Study-specific | Population and genetic-risk focus differ; not this prototype’s post-calculator ODSF + RAG + safety orchestration |
| Widmer et al. 2015 tutorial dialogues (`WIDMER-TUTORIAL-DIALOGUES-2015`) | Genetic breast-cancer risk | Educational | Tutorial dialogue system | Yes | Fuzzy-Trace / gist explanations | Teach-back style support | Research methods paper | Dialogue-based | Study-specific | Informs teach-back design; does not combine decisional-needs memory + vetted medical RAG + Groq wording controls as here |
| Mercado et al. 2023 ECA + MI review (`MERCADO-ECA-MI-2023`) | Health behaviors broadly | Varies by reviewed systems | Embodied conversational agents | Often yes | Motivational Interviewing | Behavior-change focus | Review of prior systems | Varies | Varies | Review of MI/ECA systems; not a breast-cancer risk-calculator orchestration prototype |
| Fagerlin et al. 2007 (cited in design rationale) | Risk communication | Risk-format guidance | No | No | Risk-communication principles | Supports comprehension | Methods literature | No | N/A | Format guidance, not a multi-theory adaptive orchestration layer |
| This prototype | Demonstration breast-cancer risk result | Demonstration calculator result | Text now; LiveAvatar planned | Yes | FTT, HBM, MI principles, readiness, ODSF-inspired constructs | Temporary decisional-needs estimation + option memory | Vetted medical RAG | Turn-by-turn adaptive orchestration | Safety, grounding, progression, repetition checks | Educational prototype only; clinical effectiveness not established |

## Notes

- Claims in the table are limited to what the project’s source records and
  design documents support.
- “Decisional-needs support” for this prototype means temporary
  conversational estimates inspired by Ottawa Decision Support Framework
  constructs, not a validated decisional-conflict instrument.
- No row claims clinical superiority.
