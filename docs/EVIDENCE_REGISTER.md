# Evidence Register

All active evidence chunks (`worker/rag/evidence.ts`) are now `status:
"vetted"` and traceable to one of the 10 sources below (`worker/rag/
sourceRegistry.ts`). **"Vetted" here means the chunk's text is traced to a
real, cited source with recorded URL/citation metadata — it does not mean
this application, or this evidence collection, has been clinically
validated.** Human expert review is still required before any clinical
use, the current calculator remains a demonstration calculator, and no
source below permits diagnosis or individualized treatment advice. See
`worker/rag/validateEvidence.ts` (`npm run evidence:check`) for the
automated structural checks that keep this register accurate.

All evidence is statically stored in the repository. No live medical web
search or network request occurs at runtime — every citation below was
read and paraphrased by a human before being checked into
`worker/rag/evidence.ts`.

## Medical RAG sources

Used by the chat pipeline (`POST /api/chat`, always with `sourceUse:
"medical-rag"`) to ground general medical/risk-calculator claims. These
are the **only** sources ever retrieved for a chat reply.

| Source ID | Title | Organization | Source type | URL | Citation |
|---|---|---|---|---|---|
| `NCI-BCRAT-ABOUT` | About the Breast Cancer Risk Assessment Calculator | National Cancer Institute | official-calculator-documentation | https://bcrisktool.cancer.gov/about.html | National Cancer Institute. About the Breast Cancer Risk Assessment Calculator (The Gail Model). |
| `NCI-BCRAT-CALCULATOR` | Breast Cancer Risk Assessment Tool: Online Calculator | National Cancer Institute | official-calculator-documentation | https://bcrisktool.cancer.gov/ | National Cancer Institute. Breast Cancer Risk Assessment Tool: Online Calculator (The Gail Model). |
| `NCI-RISK-TOOLS-2024` | How Breast Cancer Risk Assessment Tools Work | National Cancer Institute | government-patient-education | https://www.cancer.gov/news-events/cancer-currents-blog/2024/understanding-breast-cancer-risk-assessment-tools | Reynolds S. How Breast Cancer Risk Assessment Tools Work. National Cancer Institute. June 27, 2024. |
| `NCI-BREAST-RISK-FACTS` | Breast Cancer Risk in American Women | National Cancer Institute | government-patient-education | https://www.cancer.gov/types/breast/risk-fact-sheet | National Cancer Institute. Breast Cancer Risk in American Women. |
| `NCI-BREAST-CHANGES` | Understanding Breast Changes and Conditions: A Health Guide | National Cancer Institute | government-patient-education | https://www.cancer.gov/publications/patient-education/understanding-breast-changes | National Cancer Institute. Understanding Breast Changes and Conditions: A Health Guide. Updated August 2024. |
| `USPSTF-SCREENING-2024` | Breast Cancer: Screening | US Preventive Services Task Force | clinical-guideline | https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening | US Preventive Services Task Force. Breast Cancer: Screening. Final Recommendation Statement. April 30, 2024. |

### Medical RAG evidence chunks

| Chunk ID | Source ID | Topic | Claim supported |
|---|---|---|---|
| `nci-bcrat-purpose-001` | NCI-BCRAT-ABOUT | calculator_purpose | The tool uses the Gail Model to estimate invasive breast cancer probability over a period. |
| `nci-bcrat-inputs-001` | NCI-BCRAT-ABOUT | calculator_inputs | The tool's inputs (age, menstrual/reproductive history, family history, biopsy history). |
| `nci-bcrat-validation-001` | NCI-BCRAT-ABOUT | risk_calculator_population_limits | The model's validation is uneven across population subgroups and may underestimate risk in some. |
| `nci-bcrat-horizons-001` | NCI-BCRAT-CALCULATOR | five_year_vs_lifetime_risk | Five-year and through-age-90 estimates are distinct time horizons. |
| `nci-bcrat-scope-001` | NCI-BCRAT-CALCULATOR | calculator_scope_limits | Not intended for people with a breast cancer/DCIS/LCIS history or known hereditary mutations. |
| `nci-risk-not-certainty-001` | NCI-RISK-TOOLS-2024 | uncertainty_and_limitations | Models estimate group-level probability and cannot predict an individual outcome with certainty. |
| `nci-natural-frequency-001` | NCI-RISK-TOOLS-2024 | natural_frequency | A percentage can be explained as "X out of 100 people with similar factors." |
| `nci-elevated-not-certain-001` | NCI-RISK-TOOLS-2024 | elevated_risk_not_current_cancer | An elevated score does not mean cancer is currently present or guaranteed to develop. |
| `nci-average-not-zero-001` | NCI-RISK-TOOLS-2024 | average_risk_not_zero | An average/low score does not mean zero chance of developing breast cancer. |
| `nci-professional-interpretation-001` | NCI-RISK-TOOLS-2024 | professional_interpretation | A healthcare professional interprets a score alongside broader personal/family/clinical history. |
| `nci-population-average-001` | NCI-BREAST-RISK-FACTS | population_vs_individual_risk | Population-level risks are averages; an individual's risk may be higher or lower. |
| `nci-breast-change-followup-001` | NCI-BREAST-CHANGES | symptom_follow_up | New breast changes/abnormal results (not always cancer) should be discussed with a professional. |
| `uspstf-average-screening-001` | USPSTF-SCREENING-2024 | average_risk_screening_context | 2024 USPSTF guidance: biennial mammography, average risk, ages 40–74 (general context only — see `clinicalUseRestriction` on this chunk; never turned into an individualized recommendation). |

## Dialogue-design sources

Used only for behavioral-theory/communication-technique justification —
theory mapping (`worker/behavioral/theoryMap.ts`), developer diagnostics,
design rationale, and documentation. **Never retrieved by the normal chat
pipeline and never the factual basis for a diagnosis, treatment,
medication, or individualized screening/follow-up recommendation.**

| Source ID | Title | Organization | Source type | URL | Citation |
|---|---|---|---|---|---|
| `WOLFE-BRCA-GIST-2015` | Efficacy of a Web-Based Intelligent Tutoring System for Communicating Genetic Risk of Breast Cancer: A Fuzzy-Trace Theory Approach | Medical Decision Making | primary-research | https://pubmed.ncbi.nlm.nih.gov/24829276/ | Wolfe CR, Reyna VF, Widmer CL, et al. Med Decis Making. 2015;35(1):46-59. doi:10.1177/0272989X14535983. |
| `WIDMER-TUTORIAL-DIALOGUES-2015` | Tutorial Dialogues and Gist Explanations of Genetic Breast Cancer Risk | Behavior Research Methods | primary-research | https://pubmed.ncbi.nlm.nih.gov/25921818/ | Widmer CL, Wolfe CR, Reyna VF, et al. Behavior Research Methods. 2015. |
| `REYNA-FTT-2008` | A Theory of Medical Decision Making and Health: Fuzzy-Trace Theory | Medical Decision Making | theory-paper | https://pubmed.ncbi.nlm.nih.gov/19015287/ | Reyna VF. Med Decis Making. 2008;28(6):850-865. doi:10.1177/0272989X08327066. |
| `MERCADO-ECA-MI-2023` | Embodied Conversational Agents Providing Motivational Interviewing to Improve Health-Related Behaviors: Scoping Review | Journal of Medical Internet Research | systematic-review | https://pubmed.ncbi.nlm.nih.gov/38064707/ | Mercado M, et al. J Med Internet Res. 2023. |

### Dialogue-design evidence chunks

| Chunk ID | Source ID | Topic | Role |
|---|---|---|---|
| `reyna-ftt-gist-001` | REYNA-FTT-2008 | fuzzy_trace_gist | Justifies pairing an exact number with a plain-language "gist" (used by `clarify_risk`). |
| `wolfe-brca-gist-001` | WOLFE-BRCA-GIST-2015 | avatar_risk_communication | Prior evidence that a Fuzzy-Trace-Theory-grounded tutoring system improved gist comprehension of genetic breast cancer risk. Includes a `researchLimitation` — the study population was healthy undergraduate women, and it does not establish clinical effectiveness for this prototype. |
| `widmer-teachback-dialogue-001` | WIDMER-TUTORIAL-DIALOGUES-2015 | teach_back | Justifies using a short teach-back question to check understanding (used by `clarify_risk`). |
| `mercado-mi-evidence-001` | MERCADO-ECA-MI-2023 | motivational_interviewing_agent | Justifies open questions/reflective, autonomy-supportive technique (used by `acknowledge_emotion`, `explore_barrier`, `support_self_efficacy`, `action_planning`). |

## Notes

- No vetted medical-rag source currently addresses practical barriers
  (time/cost/access/fear/mistrust) directly. `explore_barrier`'s reply
  wording therefore comes from the local, deterministic template in
  `worker/llm/localGenerator.ts`, not from retrieved evidence — this is by
  design, since barriers are conversational, not factual, claims.
- Adding, editing, or removing a source or chunk requires human review —
  see [`SOURCE_REPLACEMENT_CHECKLIST.md`](./SOURCE_REPLACEMENT_CHECKLIST.md)
  — and must keep `npm run evidence:check` passing with no errors.
