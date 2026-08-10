# Research problem

Breast-cancer risk calculators may provide a numerical estimate that is
difficult to interpret and may not help a user decide what to do next.

# Existing approaches

The project literature and evidence register already document several
relevant categories of prior work:

- **Breast-cancer risk calculators** — including NCI BCRAT / Gail Model
  documentation used for demonstration risk context.
- **Static and personalized decision aids / risk displays** — including
  risk-communication principles summarized in the design rationale
  (for example Fagerlin et al., 2007, as cited in design documentation).
- **Avatar-based intelligent tutoring** — including BRCA Gist and related
  Fuzzy-Trace Theory tutoring work (Wolfe et al., 2015; Widmer et al., 2015).
- **Cancer / health conversational agents** — including embodied
  conversational agents using Motivational Interviewing principles
  (Mercado et al., 2023 scoping review).
- **Behavioral-theory interventions** — Health Belief Model constructs,
  readiness-to-change framing, and Motivational Interviewing communication
  principles referenced in the theory map.
- **Source-controlled medical language systems** — the prototype’s own
  vetted medical-RAG approach and related evidence-register controls.

These approaches exist and inform this prototype. This document does not
claim that they are absent from the literature.

# Integration gap

Existing systems have separately demonstrated risk calculation,
personalized education, conversational agents, avatar delivery,
behavioral theory, and decision support. Limited work has examined a
unified system that dynamically interprets changing conversational and
decisional needs after a breast-cancer risk result, maps those needs to
an explicit theory-based strategy, retrieves vetted medical evidence,
dynamically generates a response, and validates safety and conversational
progression before avatar delivery.

# Project contribution

This prototype’s distinctive contribution is an **adaptive orchestration
layer** that integrates:

- multidimensional conversational-state estimation;
- decisional-needs estimation inspired by Ottawa Decision Support
  Framework constructs;
- deterministic theory mapping;
- deterministic medical evidence retrieval;
- dynamic response wording;
- safety validation;
- progression validation;
- a path toward avatar delivery (currently text; LiveAvatar planned).

# Boundaries

- The prototype does not diagnose.
- The prototype does not recommend treatment.
- The prototype does not replace clinicians.
- The prototype has not demonstrated clinical effectiveness.
- A user study is needed to measure outcomes such as comprehension,
  decision preparedness, and acceptability.

The application estimates temporary conversational and decisional needs.
It does not diagnose a psychological condition and does not produce a
validated decisional-conflict score.

# Research question

Can a theory-informed, evidence-grounded conversational avatar
dynamically identify and address users’ changing conversational and
decisional needs after a breast-cancer risk estimate while maintaining
transparent medical-safety and evidence controls?
