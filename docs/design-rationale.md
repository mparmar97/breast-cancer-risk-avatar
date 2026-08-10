# Design Rationale — Breast Cancer Risk Companion

**Author:** Trial project submission  
**Date:** August 2026  
**One-page summary for PDF export**

> **Note on implementation status.** **Groq** powers optional dynamic
> reply generation with a local grounded fallback (rate limit / network /
> safety). Groq never chooses dialogue strategy or invents medical facts
> outside retrieved evidence — see
> [`PHASE_5_GROQ_DYNAMIC_DIALOGUE.md`](./PHASE_5_GROQ_DYNAMIC_DIALOGUE.md).
> The app includes a **built-in Gail-inspired educational calculator form**
> (not the official NCI BCRAT) that branches average vs elevated, plus a
> static **Maya** avatar image with text-chat failover when video is
> unavailable. LiveAvatar streaming remains optional for credit-budget
> reasons. Evidence is local keyword RAG over 17 chunks from 10 sources —
> see [`EVIDENCE_REGISTER.md`](./EVIDENCE_REGISTER.md). This is an
> educational prototype — not clinically validated.
>
> The prototype’s distinctive contribution is its **adaptive orchestration
> layer**. It separates conversational-state interpretation, decisional-needs
> support, behavioral-theory strategy selection, medical evidence
> retrieval, dynamic language generation, and deterministic safety
> validation. The application is designed to address contributors to
> decisional conflict and improve decision preparedness. Clinical
> effectiveness has not been established. See
> [`PROJECT_INNOVATION_SUMMARY.md`](./PROJECT_INNOVATION_SUMMARY.md) and
> [`NOVELTY_AND_RESEARCH_GAP.md`](./NOVELTY_AND_RESEARCH_GAP.md).

---

## Problem & goal

Breast cancer risk calculators return a percentage that many users find either meaningless or frightening—neither reaction reliably drives appropriate follow-up. This app adds a **2–3 minute conversational layer**: explain the number in plain language, branch on elevated vs average risk, and motivate concrete next steps without diagnosing or impersonating a clinician.

---

## Theories chosen & operationalization

### 1. Health Belief Model (HBM) — Rosenstock, 1974; updated in breast screening literature

**Why:** HBM predicts preventive action when people perceive susceptibility and severity *accurately*, believe benefits outweigh barriers, and feel capable of acting.

**In the dialogue (`shared/dialogue.ts`):**
- **Elevated branch:** Calibrate severity (“most women with this estimate do *not* get cancer”); cue to action (clinician visit in 2–4 weeks); surface barriers (cost, false alarms); build self-efficacy (“you’re already taking a helpful step”).
- **Average branch:** Reassure without false certainty; cue routine mammography; affirm existing healthy behaviors.

### 2. Fagerlin et al. risk-communication principles — *Med Decis Making* 2007

**Why:** Absolute risks with denominators (e.g., “2 in 100”) outperform relative-only framing for comprehension and appropriate worry.

**In the dialogue:** Opening script and system prompt require absolute risk + age-matched comparator; forbid “double your risk” without absolute numbers. In the implemented prototype, the `nci-natural-frequency-001` evidence chunk (National Cancer Institute — see [`EVIDENCE_REGISTER.md`](./EVIDENCE_REGISTER.md)) grounds this natural-frequency framing.

### 3. Motivational Interviewing (OARS) — Rollnick, Miller & Butler, 2008

**Why:** Direct persuasion increases resistance in health contexts; MI elicits change talk.

**In the dialogue:** Elevated branch ends with open questions (“What would help you take the next step?”); chat suggestions are user-paced; assistant reflects rather than commands.

---

## Avatar choice: “Maya” — warm female health educator

**Selection criteria (research-informed):**
- **Trust & warmth:** Health messages from perceived-credible, empathetic presenters increase recall and reduce defensive processing (source: health communication meta-literature; ACS/NCI patient-education tone).
- **Role clarity:** Introduces self as **AI health educator, not a clinician**—reduces authority misattribution and supports R7 safety.
- **Appearance:** Production avatar from LiveAvatar public catalog—professional, approachable, age-appropriate for 35–85 audience; avoids overly glamorous or clinical-stiff personas that undermine relatability in sensitive health topics.
- **Sandbox development:** Wayne avatar (`dd73ea75-…`) for zero-credit dev; swap to production female presenter avatar for deployment.

**Voice & session design:** Lite mode + Groq `llama-3.3-70b-versatile` (low latency, ~2 min target). Medium video quality to conserve bandwidth; 300 s session cap aligned with Starter plan.

---

## Engineering trade-offs

| Decision | Rationale |
|----------|-----------|
| **LiveAvatar LITE + Groq** | 1 credit/min vs 2 for FULL; full control of RAG prompt and theory scripts |
| **Gail-inspired educational form** | Same input categories as Gail/BCRAT; simplified scoring for demo branching; clearly labeled non-clinical |
| **Keyword RAG vs embeddings** | 17 small, vetted chunks from 10 real sources; deterministic citations; no embedding API cost; no live medical web search at runtime |
| **Cloudflare Workers** | Free tier, single deploy unit (SPA + API), global edge |
| **Text fallback + static image** | R5 compliance when WebRTC/avatar fails |
| **Sandbox-first dev** | Protects 150-credit budget per trial constraints |

---

## Safety (R7)

- Persistent medical disclaimer; consent before assessment  
- System prompt: no diagnosis, deflect personal symptoms  
- Scope limited to curated sources; out-of-scope → clinician referral language  

---

## References (avatar & theory)

1. Fagerlin A, et al. Presenting health risk information in different formats. *Med Decis Making.* 2007;27(5):638-654.  
2. Rosenstock IM. Historical origins of the health belief model. *Health Educ Monogr.* 1974;2:328-335.  
3. Rollnick S, Miller WR, Butler CC. *Motivational Interviewing in Health Care.* Guilford, 2008.  
4. NCI Breast Cancer Risk Assessment Tool (Gail Model). https://bcrisktool.cancer.gov/  
5. Gail MH, et al. Projecting individualized probabilities of developing breast cancer. *JNCI.* 1989.  
6. Oeffinger KC, et al. Breast cancer screening for women at average risk. *JAMA.* 2015.  

**Sources actually implemented in the prototype's evidence pipeline
today** (10 sources, 17 chunks — full citations, URLs, and per-chunk
claims in [`EVIDENCE_REGISTER.md`](./EVIDENCE_REGISTER.md)):

- Medical RAG: National Cancer Institute (About the Gail Model calculator;
  the online calculator; "How Breast Cancer Risk Assessment Tools Work";
  "Breast Cancer Risk in American Women"; "Understanding Breast Changes and
  Conditions"); US Preventive Services Task Force (2024 breast cancer
  screening recommendation).
- Dialogue-design (theory/technique rationale, never medical support):
  Reyna 2008 (Fuzzy-Trace Theory); Wolfe et al. 2015 and Widmer et al. 2015
  (BRCA Gist tutoring-dialogue studies); Mercado et al. 2023 (motivational
  interviewing in embodied conversational agents, scoping review).

---

*PDF hand-in: [`design-rationale.pdf`](./design-rationale.pdf) (regenerate with `node scripts/write-design-rationale-pdf.mjs`).*
