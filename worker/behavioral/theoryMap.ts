import type { DialogueStrategy } from './policy';

export interface TheoryConstruct {
  theory: string;
  construct: string;
  communicationTechnique: string;
  objective: string;
}

const THEORY_MAP: Record<DialogueStrategy, TheoryConstruct> = {
  clarify_risk: {
    theory: 'Fuzzy-Trace Theory',
    construct: 'essential (gist) meaning of risk',
    communicationTechnique: 'plain language and teach-back',
    objective: 'distinguish probability from diagnosis',
  },
  acknowledge_emotion: {
    theory: 'Motivational Interviewing communication principles',
    construct: 'reflective listening and autonomy support',
    communicationTechnique: 'reflection and open-ended question',
    objective: 'acknowledge emotion without increasing fear',
  },
  explain_benefit: {
    theory: 'Health Belief Model',
    construct: 'perceived benefits',
    communicationTechnique: 'permission-based explanation',
    objective: 'explain the value of appropriate professional follow-up',
  },
  explore_barrier: {
    theory: 'Health Belief Model',
    construct: 'perceived barriers',
    communicationTechnique: 'open-ended barrier exploration',
    objective: 'identify the main obstacle without judgment',
  },
  support_self_efficacy: {
    theory: 'Health Belief Model',
    construct: 'self-efficacy',
    communicationTechnique: 'manageable choices',
    objective: 'help the user identify a feasible first step',
  },
  action_planning: {
    theory: 'Health Belief Model',
    construct: 'cue to action',
    communicationTechnique: 'autonomy-supportive action planning',
    objective: 'help the user select one concrete next step',
  },
  explore_readiness: {
    theory: 'readiness-to-change framework',
    construct: 'readiness and ambivalence',
    communicationTechnique: 'open-ended question',
    objective: 'understand how the user currently feels about follow-up',
  },
  safety_boundary: {
    theory: 'medical risk-communication safety',
    construct: 'scope and role boundary',
    communicationTechnique: 'clear non-diagnostic statement',
    objective: 'prevent diagnosis and treatment advice',
  },
  urgent_referral: {
    theory: 'medical communication safety',
    construct: 'escalation beyond application scope',
    communicationTechnique: 'concise recommendation for immediate human support',
    objective: 'avoid unsafe management of urgent symptoms or crisis',
  },
};

export function getTheoryConstruct(strategy: DialogueStrategy): TheoryConstruct {
  return THEORY_MAP[strategy];
}
