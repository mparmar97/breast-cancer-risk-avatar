import { findSource } from '../rag/sourceRegistry';
import type { DialogueStrategy } from './policy';

export interface TheoryConstruct {
  theory: string;
  construct: string;
  communicationTechnique: string;
  objective: string;
  /**
   * Dialogue-design source IDs (see worker/rag/sourceRegistry.ts) that
   * justify this strategy's theory/technique choice. These citations
   * support *design rationale* only — they are never used as the factual
   * basis for a diagnosis, treatment, medication, or individualized
   * screening/follow-up recommendation. Medical claims are grounded
   * separately and exclusively through `sourceUse: "medical-rag"`
   * evidence retrieved in worker/rag/retrieve.ts.
   */
  sourceIds?: string[];
  citations?: string[];
}

function withCitations(construct: Omit<TheoryConstruct, 'citations'>): TheoryConstruct {
  const citations = (construct.sourceIds ?? [])
    .map((sourceId) => findSource(sourceId)?.citation)
    .filter((citation): citation is string => Boolean(citation));
  return { ...construct, citations: citations.length > 0 ? citations : undefined };
}

const THEORY_MAP: Record<DialogueStrategy, TheoryConstruct> = {
  clarify_risk: withCitations({
    theory: 'Fuzzy-Trace Theory',
    construct: 'essential (gist) meaning of risk',
    communicationTechnique: 'plain language and teach-back',
    objective: 'distinguish probability from diagnosis',
    sourceIds: ['REYNA-FTT-2008', 'WIDMER-TUTORIAL-DIALOGUES-2015'],
  }),
  confirm_progress: withCitations({
    theory: 'Fuzzy-Trace Theory',
    construct: 'gist comprehension confirmation',
    communicationTechnique: 'acknowledge understanding and invite next concern',
    objective: 'recognize that the explanation helped without re-explaining',
    sourceIds: ['REYNA-FTT-2008', 'WIDMER-TUTORIAL-DIALOGUES-2015'],
  }),
  greet_user: withCitations({
    theory: 'Motivational Interviewing communication principles',
    construct: 'rapport and agenda setting',
    communicationTechnique: 'brief welcome and open invitation',
    objective: 'open the conversation without assuming worry or confusion',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  close_supportively: withCitations({
    theory: 'Motivational Interviewing communication principles',
    construct: 'autonomy support',
    communicationTechnique: 'supportive closing without pressure',
    objective: 'end the conversation without introducing a new barrier or action demand',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  ask_clarification: withCitations({
    theory: 'Motivational Interviewing communication principles',
    construct: 'open questions',
    communicationTechnique: 'one targeted clarifying question',
    objective: 'recover from a user correction without repeating the prior answer',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  acknowledge_emotion: withCitations({
    theory: 'Motivational Interviewing communication principles',
    construct: 'reflective listening and autonomy support',
    communicationTechnique: 'reflection and open-ended question',
    objective: 'acknowledge emotion without increasing fear',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  explain_benefit: withCitations({
    theory: 'Health Belief Model',
    construct: 'perceived benefits',
    communicationTechnique: 'permission-based explanation of benefits and cues to action',
    objective: 'explain the value of professional follow-up and healthy lifestyle steps without prescribing treatment',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  explore_barrier: withCitations({
    theory: 'Health Belief Model',
    construct: 'perceived barriers',
    communicationTechnique: 'open-ended barrier exploration',
    objective: 'identify the main obstacle without judgment',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  support_self_efficacy: withCitations({
    theory: 'Health Belief Model',
    construct: 'self-efficacy',
    communicationTechnique: 'manageable choices',
    objective: 'help the user identify a feasible first step',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  action_planning: withCitations({
    theory: 'Health Belief Model',
    construct: 'cue to action',
    communicationTechnique: 'autonomy-supportive action planning',
    objective: 'help the user select one concrete next step',
    sourceIds: ['MERCADO-ECA-MI-2023'],
  }),
  explore_readiness: withCitations({
    theory: 'readiness-to-change framework',
    construct: 'readiness and ambivalence',
    communicationTechnique: 'open-ended question',
    objective: 'understand how the user currently feels about follow-up',
  }),
  safety_boundary: withCitations({
    theory: 'medical risk-communication safety',
    construct: 'scope and role boundary',
    communicationTechnique: 'clear non-diagnostic statement',
    objective: 'prevent diagnosis and treatment advice',
  }),
  urgent_referral: withCitations({
    theory: 'medical communication safety',
    construct: 'escalation beyond application scope',
    communicationTechnique: 'concise recommendation for immediate human support',
    objective: 'avoid unsafe management of urgent symptoms or crisis',
  }),
};

export function getTheoryConstruct(strategy: DialogueStrategy): TheoryConstruct {
  return THEORY_MAP[strategy];
}
