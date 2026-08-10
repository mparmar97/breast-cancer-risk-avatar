import type { EvidenceSourceType, EvidenceUse } from './types';

/**
 * The vetted sources backing the evidence chunks in
 * worker/rag/evidence.ts. Each source is recorded exactly once here;
 * evidence chunks reference a source by `sourceId` rather than repeating
 * its metadata, so the same organization/URL/citation can never drift out
 * of sync between chunks. See docs/EVIDENCE_REGISTER.md for the
 * human-readable register and docs/SOURCE_REPLACEMENT_CHECKLIST.md for how
 * new sources should be vetted before being added here.
 *
 * This registry is static, hand-entered, and read at build/deploy time
 * only — the application makes no live network request to any of these
 * URLs at runtime.
 */
export interface EvidenceSource {
  sourceId: string;
  title: string;
  organization: string;
  sourceUse: EvidenceUse;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
}

export const SOURCE_REGISTRY: EvidenceSource[] = [
  {
    sourceId: 'NCI-BCRAT-ABOUT',
    title: 'About the Breast Cancer Risk Assessment Calculator',
    organization: 'National Cancer Institute',
    sourceUse: 'medical-rag',
    sourceType: 'official-calculator-documentation',
    sourceUrl: 'https://bcrisktool.cancer.gov/about.html',
    accessedDate: '2026-08-04',
    citation: 'National Cancer Institute. About the Breast Cancer Risk Assessment Calculator (The Gail Model).',
  },
  {
    sourceId: 'NCI-BCRAT-CALCULATOR',
    title: 'Breast Cancer Risk Assessment Tool: Online Calculator',
    organization: 'National Cancer Institute',
    sourceUse: 'medical-rag',
    sourceType: 'official-calculator-documentation',
    sourceUrl: 'https://bcrisktool.cancer.gov/',
    accessedDate: '2026-08-04',
    citation:
      'National Cancer Institute. Breast Cancer Risk Assessment Tool: Online Calculator (The Gail Model).',
  },
  {
    sourceId: 'NCI-RISK-TOOLS-2024',
    title: 'How Breast Cancer Risk Assessment Tools Work',
    organization: 'National Cancer Institute',
    sourceUse: 'medical-rag',
    sourceType: 'government-patient-education',
    sourceUrl:
      'https://www.cancer.gov/news-events/cancer-currents-blog/2024/understanding-breast-cancer-risk-assessment-tools',
    publicationDate: '2024-06-27',
    accessedDate: '2026-08-04',
    citation: 'Reynolds S. How Breast Cancer Risk Assessment Tools Work. National Cancer Institute. June 27, 2024.',
  },
  {
    sourceId: 'NCI-BREAST-RISK-FACTS',
    title: 'Breast Cancer Risk in American Women',
    organization: 'National Cancer Institute',
    sourceUse: 'medical-rag',
    sourceType: 'government-patient-education',
    sourceUrl: 'https://www.cancer.gov/types/breast/risk-fact-sheet',
    accessedDate: '2026-08-04',
    citation: 'National Cancer Institute. Breast Cancer Risk in American Women.',
  },
  {
    sourceId: 'NCI-BREAST-CHANGES',
    title: 'Understanding Breast Changes and Conditions: A Health Guide',
    organization: 'National Cancer Institute',
    sourceUse: 'medical-rag',
    sourceType: 'government-patient-education',
    sourceUrl: 'https://www.cancer.gov/publications/patient-education/understanding-breast-changes',
    publicationDate: '2024-08',
    accessedDate: '2026-08-04',
    citation: 'National Cancer Institute. Understanding Breast Changes and Conditions: A Health Guide. Updated August 2024.',
  },
  {
    sourceId: 'USPSTF-SCREENING-2024',
    title: 'Breast Cancer: Screening',
    organization: 'United States Preventive Services Task Force',
    sourceUse: 'medical-rag',
    sourceType: 'clinical-guideline',
    sourceUrl: 'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening',
    publicationDate: '2024-04-30',
    accessedDate: '2026-08-04',
    citation: 'US Preventive Services Task Force. Breast Cancer: Screening. Final Recommendation Statement. April 30, 2024.',
  },
  {
    sourceId: 'NCI-PHYSICAL-ACTIVITY-FACT',
    title: 'Physical Activity and Cancer Fact Sheet',
    organization: 'National Cancer Institute',
    sourceUse: 'medical-rag',
    sourceType: 'government-patient-education',
    sourceUrl: 'https://www.cancer.gov/about-cancer/causes-prevention/risk/obesity/physical-activity-fact-sheet',
    accessedDate: '2026-08-07',
    citation:
      'National Cancer Institute. Physical Activity and Cancer Fact Sheet. https://www.cancer.gov/about-cancer/causes-prevention/risk/obesity/physical-activity-fact-sheet',
  },
  {
    sourceId: 'NCI-BREAST-PREVENTION-PDQ',
    title: 'Breast Cancer Prevention (PDQ®)–Health Professional Version',
    organization: 'National Cancer Institute',
    sourceUse: 'medical-rag',
    sourceType: 'government-patient-education',
    sourceUrl: 'https://www.cancer.gov/types/breast/hp/breast-prevention-pdq',
    accessedDate: '2026-08-07',
    citation:
      'National Cancer Institute. Breast Cancer Prevention (PDQ®)–Health Professional Version. https://www.cancer.gov/types/breast/hp/breast-prevention-pdq',
  },
  {
    sourceId: 'ACS-BREAST-RISK-PREVENTION',
    title: 'Breast Cancer Risk and Prevention',
    organization: 'American Cancer Society',
    sourceUse: 'medical-rag',
    sourceType: 'professional-society-patient-education',
    sourceUrl: 'https://www.cancer.org/cancer/types/breast-cancer/risk-and-prevention.html',
    accessedDate: '2026-08-07',
    citation:
      'American Cancer Society. Breast Cancer Risk and Prevention. https://www.cancer.org/cancer/types/breast-cancer/risk-and-prevention.html',
  },
  {
    sourceId: 'WOLFE-BRCA-GIST-2015',
    title:
      'Efficacy of a Web-Based Intelligent Tutoring System for Communicating Genetic Risk of Breast Cancer: A Fuzzy-Trace Theory Approach',
    organization: 'Medical Decision Making',
    sourceUse: 'dialogue-design',
    sourceType: 'primary-research',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/24829276/',
    publicationDate: '2015',
    accessedDate: '2026-08-04',
    citation:
      'Wolfe CR, Reyna VF, Widmer CL, et al. Efficacy of a web-based intelligent tutoring system for communicating genetic risk of breast cancer: a fuzzy-trace theory approach. Med Decis Making. 2015;35(1):46-59. doi:10.1177/0272989X14535983.',
  },
  {
    sourceId: 'WIDMER-TUTORIAL-DIALOGUES-2015',
    title: 'Tutorial Dialogues and Gist Explanations of Genetic Breast Cancer Risk',
    organization: 'Behavior Research Methods',
    sourceUse: 'dialogue-design',
    sourceType: 'primary-research',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/25921818/',
    publicationDate: '2015',
    accessedDate: '2026-08-04',
    citation: 'Widmer CL, Wolfe CR, Reyna VF, et al. Tutorial dialogues and gist explanations of genetic breast cancer risk. Behavior Research Methods. 2015.',
  },
  {
    sourceId: 'REYNA-FTT-2008',
    title: 'A Theory of Medical Decision Making and Health: Fuzzy-Trace Theory',
    organization: 'Medical Decision Making',
    sourceUse: 'dialogue-design',
    sourceType: 'theory-paper',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/19015287/',
    publicationDate: '2008',
    accessedDate: '2026-08-04',
    citation: 'Reyna VF. A theory of medical decision making and health: fuzzy-trace theory. Med Decis Making. 2008;28(6):850-865. doi:10.1177/0272989X08327066.',
  },
  {
    sourceId: 'MERCADO-ECA-MI-2023',
    title:
      'Embodied Conversational Agents Providing Motivational Interviewing to Improve Health-Related Behaviors: Scoping Review',
    organization: 'Journal of Medical Internet Research',
    sourceUse: 'dialogue-design',
    sourceType: 'systematic-review',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/38064707/',
    publicationDate: '2023',
    accessedDate: '2026-08-04',
    citation: 'Mercado M, et al. Embodied conversational agents providing motivational interviewing to improve health-related behaviors: scoping review. J Med Internet Res. 2023.',
  },
];

const SOURCE_BY_ID = new Map(SOURCE_REGISTRY.map((source) => [source.sourceId, source]));

export function findSource(sourceId: string): EvidenceSource | undefined {
  return SOURCE_BY_ID.get(sourceId);
}
