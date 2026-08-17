# Design Rationale — VARE Breast-Cancer Risk Avatar

**Author:** Trial project submission | **Date:** August 2026

## Problem and goal

Breast-cancer risk calculators return a percentage many users find meaningless or frightening—neither drives reliable follow-up. VARE adds a 2-3 minute conversational layer after a Gail-inspired educational estimate: explain the number, adapt to understanding/emotion/barriers/readiness, support decision preparedness, and motivate optional next steps—without diagnosing or impersonating a clinician. Educational prototype only; not clinically validated.

## Design decision: adaptive orchestration

The pipeline separates conversational-state estimation, Ottawa-inspired decisional-needs support, deterministic theory-based strategy selection, vetted local RAG, dynamic Groq wording (with local fallback), and safety validation. Groq never chooses strategy or invents medical facts outside retrieved evidence.

## Theories and operationalization

**Fuzzy-Trace Theory (FTT)** — Reyna 2008; Wolfe et al. 2015; Widmer et al. 2015. Users need gist (probability is not diagnosis) before action talk. Implemented via clarify_risk + teach-back when understanding is partial/incorrect.

**Health Belief Model (HBM)** — Rosenstock 1974. Preventive action requires calibrated severity, benefits vs barriers, self-efficacy, cues to action. Elevated branch calibrates severity and surfaces barriers; average branch reassures without false certainty.

**Motivational Interviewing (MI)** — Rollnick et al. 2008; Mercado et al. 2023. Direct persuasion increases resistance; reflection and open questions preserve autonomy in acknowledge_emotion and planning turns.

**Ottawa Decision Support Framework–inspired** — Stacey et al. 2014. Estimates temporary decisional needs (missing information, unclear options/preferences, low confidence) and supports drafting/timing without making medical decisions. Selected options (portal vs phone) persist across turns.

**Risk-communication framing** — Fagerlin et al. 2007; NCI 2024. Natural frequencies (“X in 100”) over relative-only framing; grounded in vetted NCI evidence chunks.

## Avatar choice

**Production:** LiveAvatar “Ann Doctor Sitting”—professional, approachable female presenter; warm tone aligned with NCI/ACS patient-education style (ages 35-85). **Failover:** static “Maya” image + text when video unavailable. **Role:** AI health educator, not a clinician (reduces authority misattribution). **Architecture:** LiveAvatar LITE—app controls all medical content; avatar lip-syncs verbatim validated text only. Wolfe 2015 supports FTT-grounded avatar risk tutoring; Mercado 2023 supports MI-consistent embodied agents.

## Engineering and safety

LiveAvatar LITE (1 credit/min) preserves RAG/theory control vs FULL. Keyword RAG: 17 vetted chunks (NCI, USPSTF, ACS). Gail-inspired form (not official BCRAT). Cloudflare Workers single deploy. Consent + fixed safety overrides for diagnosis, treatment, urgent symptoms, crisis.

## References

1. Reyna VF. Fuzzy-Trace Theory. Med Decis Making. 2008;28(6):850-865.  
2. Wolfe CR, et al. FTT genetic breast cancer risk tutoring. Med Decis Making. 2015;35(1):46-59.  
3. Widmer CL, et al. Tutorial dialogues & gist. Behav Res Methods. 2015.  
4. Rosenstock IM. Health Belief Model. Health Educ Monogr. 1974;2:328-335.  
5. Rollnick S, Miller WR, Butler CC. Motivational Interviewing in Health Care. Guilford, 2008.  
6. Mercado M, et al. ECAs + MI scoping review. J Med Internet Res. 2023.  
7. Stacey D, et al. Decision aids (Ottawa framework update). Cochrane. 2014.  
8. Fagerlin A, et al. Risk format presentation. Med Decis Making. 2007;27(5):638-654.  
9. Reynolds S. How Breast Cancer Risk Assessment Tools Work. NCI. June 27, 2024.
