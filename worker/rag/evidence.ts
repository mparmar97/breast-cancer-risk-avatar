/**
 * Statically curated evidence collection.
 *
 * - Every chunk below is hand-entered from the paraphrases and citations
 *   supplied by the product owner and reviewed against
 *   worker/rag/sourceRegistry.ts — nothing here is generated, invented, or
 *   fetched at runtime. The application performs no live web search or
 *   retrieval; this file (plus sourceRegistry.ts) is the entire evidence
 *   base.
 * - Chunks are split into two uses (see `EvidenceUse` in
 *   worker/rag/types.ts): `medical-rag` chunks may support general
 *   medical/risk-calculator claims made in the chat pipeline;
 *   `dialogue-design` chunks justify behavioral-theory and
 *   conversational-technique choices (worker/behavioral/theoryMap.ts) and
 *   are surfaced only in developer diagnostics/documentation — never as
 *   the factual basis for a diagnosis, treatment, medication, or
 *   individualized screening/follow-up recommendation. See
 *   worker/rag/retrieve.ts for how this separation is enforced at query
 *   time.
 * - Adding, editing, or removing a chunk (or a source in
 *   sourceRegistry.ts) requires human review — see
 *   docs/SOURCE_REPLACEMENT_CHECKLIST.md — and must keep
 *   `worker/rag/validateEvidence.ts` passing with no errors.
 * - "vetted" status here means the text is traced to a real source with
 *   recorded citation/URL metadata. It does not mean the application (or
 *   this evidence) has been clinically validated — see
 *   docs/EVIDENCE_REGISTER.md.
 */

import { findSource } from './sourceRegistry';
import type { EvidenceChunk, EvidenceStatus } from './types';

interface ChunkDefinition {
  id: string;
  sourceId: string;
  section: string;
  topic: string;
  keywords: string[];
  text: string;
  status: EvidenceStatus;
  clinicalUseRestriction?: string;
  researchLimitation?: string;
}

/**
 * Merges a chunk definition with its source registry entry. Throws
 * immediately (at module load — i.e. at build/test time, never at
 * request time) if the chunk references an unknown source, or if a
 * vetted chunk's source is missing metadata required for traceability.
 * This is intentional fail-fast behavior: unknown or incomplete source
 * metadata must never be silently substituted.
 */
function buildEvidenceChunk(definition: ChunkDefinition): EvidenceChunk {
  const source = findSource(definition.sourceId);
  if (!source) {
    throw new Error(`Evidence chunk "${definition.id}" references unknown sourceId "${definition.sourceId}".`);
  }
  if (!definition.text || definition.text.trim().length === 0) {
    throw new Error(`Evidence chunk "${definition.id}" has empty text.`);
  }
  if (definition.status === 'vetted') {
    if (!source.sourceUrl) {
      throw new Error(`Vetted evidence chunk "${definition.id}" has a source ("${source.sourceId}") missing a URL.`);
    }
    if (!source.citation) {
      throw new Error(`Vetted evidence chunk "${definition.id}" has a source ("${source.sourceId}") missing a citation.`);
    }
    if (!source.organization) {
      throw new Error(`Vetted evidence chunk "${definition.id}" has a source ("${source.sourceId}") missing an organization.`);
    }
  }

  return {
    id: definition.id,
    sourceId: definition.sourceId,
    title: source.title,
    organization: source.organization,
    section: definition.section,
    topic: definition.topic,
    keywords: definition.keywords,
    text: definition.text,
    status: definition.status,
    sourceUse: source.sourceUse,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
    publicationDate: source.publicationDate,
    accessedDate: source.accessedDate,
    citation: source.citation,
    clinicalUseRestriction: definition.clinicalUseRestriction,
    researchLimitation: definition.researchLimitation,
  };
}

const CHUNK_DEFINITIONS: ChunkDefinition[] = [
  // --- medical-rag chunks (NCI-BCRAT-ABOUT) --------------------------------
  {
    id: 'nci-bcrat-purpose-001',
    sourceId: 'NCI-BCRAT-ABOUT',
    section: 'The Gail Model',
    topic: 'calculator_purpose',
    keywords: ['breast cancer', 'risk estimate', 'absolute risk', 'invasive breast cancer', 'gail model', 'calculator'],
    text:
      'The Breast Cancer Risk Assessment Tool uses the Gail Model to estimate the probability of developing invasive breast cancer over specified periods of time.',
    status: 'vetted',
  },
  {
    id: 'nci-bcrat-inputs-001',
    sourceId: 'NCI-BCRAT-ABOUT',
    section: 'The Gail Model',
    topic: 'calculator_inputs',
    keywords: ['age', 'menstruation', 'first live birth', 'family history', 'biopsy', 'atypical hyperplasia', 'risk factors'],
    text:
      'The tool uses selected information including age, age at the start of menstruation, age at first live birth, breast cancer in first-degree relatives, previous breast biopsies, and atypical hyperplasia.',
    status: 'vetted',
  },
  {
    id: 'nci-bcrat-validation-001',
    sourceId: 'NCI-BCRAT-ABOUT',
    section: 'Testing the Model',
    topic: 'risk_calculator_population_limits',
    keywords: ['validation', 'population', 'subgroup', 'underestimate', 'limitations', 'black women', 'hispanic women'],
    text:
      'The Gail Model has been evaluated in several United States population groups, but its performance is not identical in every subgroup and it may underestimate risk in some populations.',
    status: 'vetted',
  },

  // --- medical-rag chunks (NCI-BCRAT-CALCULATOR) ---------------------------
  {
    id: 'nci-bcrat-horizons-001',
    sourceId: 'NCI-BCRAT-CALCULATOR',
    section: 'About the Calculator',
    topic: 'five_year_vs_lifetime_risk',
    keywords: ['five year', 'lifetime', 'age 90', 'risk horizon', 'time period', 'absolute risk'],
    text:
      'The calculator estimates invasive breast cancer risk over the next five years and through age 90. These are different time horizons and should be explained separately.',
    status: 'vetted',
  },
  {
    id: 'nci-bcrat-scope-001',
    sourceId: 'NCI-BCRAT-CALCULATOR',
    section: 'Calculator Limitations',
    topic: 'calculator_scope_limits',
    keywords: ['breast cancer history', 'dcis', 'lcis', 'brca', 'hereditary syndrome', 'not appropriate', 'limitation'],
    text:
      'The calculator is not intended to accurately estimate risk for people with a history of breast cancer, DCIS, or LCIS. Other assessment approaches may be more appropriate for people with known BRCA1 or BRCA2 mutations or other hereditary cancer syndromes.',
    status: 'vetted',
  },

  // --- medical-rag chunks (NCI-RISK-TOOLS-2024) ----------------------------
  {
    id: 'nci-risk-not-certainty-001',
    sourceId: 'NCI-RISK-TOOLS-2024',
    section: 'Individual prediction',
    topic: 'uncertainty_and_limitations',
    keywords: ['certainty', 'prediction', 'population average', 'individual outcome', 'probability', 'future'],
    text:
      'Breast cancer risk models provide estimates based on groups of people with similar factors. They cannot predict with certainty which individual person will or will not develop breast cancer.',
    status: 'vetted',
  },
  {
    id: 'nci-natural-frequency-001',
    sourceId: 'NCI-RISK-TOOLS-2024',
    section: 'Interpreting percentages',
    topic: 'natural_frequency',
    keywords: ['percentage', 'out of 100', 'natural frequency', 'probability', 'risk explanation'],
    text:
      'A percentage can be explained as a natural frequency. For example, a five-percent estimate means that about five out of one hundred people with similar risk factors may develop breast cancer during the stated period, without identifying which individuals they will be.',
    status: 'vetted',
  },
  {
    id: 'nci-elevated-not-certain-001',
    sourceId: 'NCI-RISK-TOOLS-2024',
    section: 'Interpreting high and low estimates',
    topic: 'elevated_risk_not_current_cancer',
    keywords: ['elevated risk', 'high risk', 'diagnosis', 'certainty', 'cancer present', 'probability'],
    text:
      'An elevated calculated risk does not mean that breast cancer is currently present and does not guarantee that breast cancer will develop.',
    status: 'vetted',
  },
  {
    id: 'nci-average-not-zero-001',
    sourceId: 'NCI-RISK-TOOLS-2024',
    section: 'Interpreting high and low estimates',
    topic: 'average_risk_not_zero',
    keywords: ['average risk', 'low risk', 'zero risk', 'guarantee', 'screening', 'probability'],
    text:
      'An average or relatively low calculated risk does not mean that the person has zero chance of developing breast cancer.',
    status: 'vetted',
  },
  {
    id: 'nci-professional-interpretation-001',
    sourceId: 'NCI-RISK-TOOLS-2024',
    section: 'Using a risk estimate',
    topic: 'professional_interpretation',
    keywords: ['healthcare professional', 'doctor', 'clinician', 'interpret', 'follow up', 'medical history'],
    text:
      'A healthcare professional can help interpret a calculated estimate in the context of broader personal, family, and clinical information.',
    status: 'vetted',
  },

  // --- medical-rag chunks (NCI-BREAST-RISK-FACTS) --------------------------
  {
    id: 'nci-population-average-001',
    sourceId: 'NCI-BREAST-RISK-FACTS',
    section: 'Individual and population risk',
    topic: 'population_vs_individual_risk',
    keywords: ['population average', 'individual risk', 'higher', 'lower', 'risk factors', 'uncertainty'],
    text:
      "Population-level breast cancer risks are averages. An individual person's estimated risk may be higher or lower depending on known risk factors and factors that are not fully understood.",
    status: 'vetted',
  },

  // --- medical-rag chunks (NCI-BREAST-CHANGES) -----------------------------
  {
    id: 'nci-breast-change-followup-001',
    sourceId: 'NCI-BREAST-CHANGES',
    section: 'Following up on breast changes',
    topic: 'symptom_follow_up',
    keywords: ['breast change', 'lump', 'abnormal result', 'follow up', 'doctor', 'medical evaluation'],
    text:
      'Breast changes and abnormal mammogram findings are not always cancer, but a new breast change or abnormal result should be discussed with a qualified healthcare professional.',
    status: 'vetted',
  },

  // --- medical-rag chunk (USPSTF-SCREENING-2024) ---------------------------
  {
    id: 'uspstf-average-screening-001',
    sourceId: 'USPSTF-SCREENING-2024',
    section: 'Recommendation',
    topic: 'average_risk_screening_context',
    keywords: ['screening', 'mammography', 'average risk', 'age 40', 'age 74', 'two years', 'recommendation'],
    text:
      'The 2024 USPSTF recommendation supports screening mammography every two years for average-risk people assigned female at birth from ages 40 through 74.',
    status: 'vetted',
    clinicalUseRestriction:
      'General guideline context only. Do not use this chunk to generate an individualized screening recommendation from the prototype risk score.',
  },

  // --- dialogue-design chunks -----------------------------------------------
  {
    id: 'reyna-ftt-gist-001',
    sourceId: 'REYNA-FTT-2008',
    section: 'Gist and verbatim representation',
    topic: 'fuzzy_trace_gist',
    keywords: ['gist', 'verbatim', 'bottom line', 'risk communication', 'decision making', 'plain language'],
    text:
      'Fuzzy-Trace Theory distinguishes detailed numerical information from its essential or bottom-line meaning. Risk communication can present both the exact number and a plain-language gist.',
    status: 'vetted',
  },
  {
    id: 'wolfe-brca-gist-001',
    sourceId: 'WOLFE-BRCA-GIST-2015',
    section: 'Intervention and findings',
    topic: 'avatar_risk_communication',
    keywords: ['brca gist', 'avatar', 'intelligent tutoring', 'breast cancer', 'risk comprehension', 'fuzzy trace'],
    text:
      'BRCA Gist used an intelligent tutoring system grounded in Fuzzy-Trace Theory to teach genetic breast cancer risk. In its study population, the intervention improved knowledge and gist comprehension compared with comparison materials.',
    status: 'vetted',
    researchLimitation:
      'The study involved healthy undergraduate women and addressed genetic breast cancer risk education. It does not establish clinical effectiveness for this prototype.',
  },
  {
    id: 'widmer-teachback-dialogue-001',
    sourceId: 'WIDMER-TUTORIAL-DIALOGUES-2015',
    section: 'Tutorial dialogue design',
    topic: 'teach_back',
    keywords: ['teach back', 'own words', 'tutorial dialogue', 'understanding', 'gist explanation', 'breast cancer risk'],
    text:
      'The BRCA Gist dialogue asked users to explain genetic breast cancer risk concepts in their own words. This supports using a short teach-back question to identify misunderstanding.',
    status: 'vetted',
  },
  {
    id: 'mercado-mi-evidence-001',
    sourceId: 'MERCADO-ECA-MI-2023',
    section: 'Motivational interviewing in embodied agents',
    topic: 'motivational_interviewing_agent',
    keywords: ['motivational interviewing', 'embodied conversational agent', 'reflection', 'open question', 'autonomy', 'behavior change'],
    text:
      'Research on embodied conversational agents delivering motivational interviewing emphasizes explicit use of techniques such as open questions, reflective responses, and collaborative, autonomy-supportive communication.',
    status: 'vetted',
  },
];

export const EVIDENCE_COLLECTION: EvidenceChunk[] = CHUNK_DEFINITIONS.map(buildEvidenceChunk);
