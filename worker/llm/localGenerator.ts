import type { DialogueStrategy } from '../behavioral/policy';
import type { AdaptiveState, Barrier } from '../behavioral/state';
import type { RetrievedEvidence } from '../rag/types';
import type { RiskResult } from '../types';

// Deterministic, template-based response generation. No external LLM call is
// made in this phase — responses are fixed, theory-informed strings selected
// by dialogue strategy (and, for explore_barrier, by the detected barrier),
// and factual/medical claims are only ever used when supported by locally
// retrieved evidence (see worker/rag/). Every response is kept short, asks
// at most one question, and avoids diagnostic or treatment language.

export interface LocalResponseInput {
  strategy: DialogueStrategy;
  state: AdaptiveState;
  riskResult: RiskResult;
  evidence: RetrievedEvidence[];
}

// Topics whose presence in the retrieved (medical-rag only — see
// worker/rag/retrieve.ts) evidence justifies the factual "a risk estimate
// is not a diagnosis" style claim used by clarify_risk and
// acknowledge_emotion. If none of these topics were retrieved, those
// strategies fall back to safer, ungrounded wording rather than asserting
// an unsupported medical claim. Kept in sync with the vetted topics
// defined in worker/rag/evidence.ts.
const RISK_INTERPRETATION_TOPICS = new Set([
  'calculator_purpose',
  'elevated_risk_not_current_cancer',
  'average_risk_not_zero',
]);

function hasGroundingTopic(evidence: RetrievedEvidence[], topics: ReadonlySet<string>): boolean {
  return evidence.some((item) => topics.has(item.topic));
}

export const NO_EVIDENCE_FALLBACK_RESPONSE =
  'I do not have enough grounded information to answer that safely. I can explain the general meaning of the demonstration risk result, but a qualified healthcare professional should interpret personal medical questions.';

const CLARIFY_RISK_RESPONSE =
  'A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer. In your own words, what do you think the percentage means?';

const ACKNOWLEDGE_EMOTION_WITH_CLAIM =
  'It sounds like seeing this result has been worrying. A risk estimate is not a diagnosis. What part of the result feels most concerning?';

const ACKNOWLEDGE_EMOTION_WITHOUT_CLAIM =
  'It sounds like seeing this result has been worrying. What part of the result feels most concerning?';

const BARRIER_RESPONSES: Partial<Record<Barrier, string>> = {
  fear: 'It sounds like fear is making follow-up feel difficult. What part of taking the next step feels most concerning?',
  time: 'It sounds like time is the main obstacle. Would sending a patient-portal message or writing down a question for your next appointment feel more manageable?',
  cost: 'It sounds like cost may be making follow-up difficult. Would it help to identify a clinic contact who can explain appointment or coverage options?',
  access:
    'It is understandable not to know where to begin. Would starting with your primary-care office or patient portal feel manageable?',
  mistrust:
    'It sounds like you are uncertain about trusting the result. What part of the calculator or explanation concerns you most?',
  uncertainty:
    'It sounds like uncertainty is making the next step difficult. What information would help you feel clearer?',
  other:
    'It sounds like something may be making follow-up difficult. What is the main obstacle for you right now?',
};

const STATIC_RESPONSES: Partial<Record<DialogueStrategy, string>> = {
  explain_benefit:
    'A healthcare professional can interpret the estimate together with your personal and family history. Would it be helpful to discuss what a follow-up conversation might involve?',
  support_self_efficacy:
    'It is okay not to know exactly where to start. Would sending a patient-portal message or writing down a question for your next appointment feel more manageable?',
  action_planning:
    'You have identified a possible next step. A healthcare professional can interpret the result using broader medical information. What action feels realistic for you?',
  explore_readiness:
    'How do you currently feel about discussing this result with a healthcare professional?',
};

const FALLBACK_RESPONSE = STATIC_RESPONSES.explore_readiness as string;

/**
 * Generates a deterministic, theory-informed, evidence-grounded reply for
 * a non-safety dialogue strategy. `safety_boundary` and `urgent_referral`
 * are handled separately by worker/safety/safetyResponses.ts, which takes
 * precedence over this generator entirely and never depends on it — see
 * worker/index.ts.
 *
 * Only `clarify_risk` and `acknowledge_emotion` make a factual claim about
 * what a risk estimate means, so only those two strategies are gated on
 * retrieved evidence: if no relevant evidence was retrieved, they fall
 * back to safer wording (or, for clarify_risk, the explicit "not enough
 * grounded information" fallback) rather than asserting an unsupported
 * claim. Other strategies offer behavioral suggestions, not medical
 * claims, so they are not evidence-gated.
 */
export function generateLocalResponse(input: LocalResponseInput): string {
  const { strategy, state, evidence } = input;
  const isGrounded = hasGroundingTopic(evidence, RISK_INTERPRETATION_TOPICS);

  if (strategy === 'clarify_risk') {
    return isGrounded ? CLARIFY_RISK_RESPONSE : NO_EVIDENCE_FALLBACK_RESPONSE;
  }

  if (strategy === 'acknowledge_emotion') {
    return isGrounded ? ACKNOWLEDGE_EMOTION_WITH_CLAIM : ACKNOWLEDGE_EMOTION_WITHOUT_CLAIM;
  }

  if (strategy === 'explore_barrier') {
    return BARRIER_RESPONSES[state.barrier] ?? (BARRIER_RESPONSES.other as string);
  }

  return STATIC_RESPONSES[strategy] ?? FALLBACK_RESPONSE;
}
