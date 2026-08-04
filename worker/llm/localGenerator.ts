import type { DialogueStrategy } from '../behavioral/policy';
import type { AdaptiveState } from '../behavioral/state';
import type { RiskResult } from '../types';

// Deterministic, template-based response generation. No external LLM call is
// made in this phase — responses are fixed, theory-informed strings selected
// by dialogue strategy (and, for explore_barrier, by the detected barrier).
// Every response is kept short, asks at most one question, and avoids
// diagnostic or treatment language so it is safe to return without an LLM
// in the loop.

const BARRIER_RESPONSES: Record<string, string> = {
  fear: 'It sounds like fear is making follow-up feel difficult. What part of taking the next step feels most concerning?',
  time: 'It sounds like time is the main obstacle. Would sending a patient-portal message or writing down a question for your next appointment feel more manageable?',
  cost: 'It sounds like cost may be making follow-up difficult. Would it help to identify a clinic contact who can explain available appointment or coverage options?',
  access:
    'It is understandable not to know where to begin. Would starting with your primary-care office or patient portal feel manageable?',
  mistrust:
    'It sounds like you are uncertain about trusting the result. What part of the calculator or explanation concerns you most?',
  uncertainty:
    'It sounds like uncertainty is making the next step difficult. What information would help you feel clearer?',
  other:
    'It sounds like something may be making follow-up difficult. What is the main obstacle for you right now?',
};

const STRATEGY_RESPONSES: Partial<Record<DialogueStrategy, string>> = {
  clarify_risk:
    'A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer. In your own words, what do you think the percentage means?',
  acknowledge_emotion:
    'It sounds like seeing this result has been worrying. A risk estimate is not a diagnosis. What part of the result feels most concerning?',
  explain_benefit:
    'A healthcare professional can interpret the estimate together with your personal and family history. Would it be helpful to discuss what a follow-up conversation might involve?',
  support_self_efficacy:
    'It is okay not to know exactly where to start. Would sending a patient-portal message or writing down a question for your next appointment feel more manageable?',
  action_planning:
    'You have identified a possible next step. A healthcare professional can interpret the result using your complete history. What action feels realistic for you?',
  explore_readiness:
    'How do you currently feel about discussing this result with a healthcare professional?',
};

const FALLBACK_RESPONSE = STRATEGY_RESPONSES.explore_readiness as string;

/**
 * Generates a deterministic, theory-informed reply for a non-safety
 * dialogue strategy. `safety_boundary` and `urgent_referral` are handled
 * separately by worker/safety/safetyResponses.ts, which takes precedence
 * over this generator entirely — see worker/index.ts.
 *
 * `riskResult` is accepted for future personalization (e.g. referencing the
 * specific branch/percentage) but is not yet interpolated into the fixed,
 * pre-approved wording used in this phase.
 */
export function generateLocalResponse(
  strategy: DialogueStrategy,
  state: AdaptiveState,
  _riskResult: RiskResult,
): string {
  if (strategy === 'explore_barrier') {
    return BARRIER_RESPONSES[state.barrier] ?? BARRIER_RESPONSES.other;
  }

  return STRATEGY_RESPONSES[strategy] ?? FALLBACK_RESPONSE;
}
