import type { AdaptiveState } from './state';

export type DialogueStrategy =
  | 'safety_boundary'
  | 'urgent_referral'
  | 'clarify_risk'
  | 'acknowledge_emotion'
  | 'explain_benefit'
  | 'explore_barrier'
  | 'support_self_efficacy'
  | 'action_planning'
  | 'explore_readiness';

/**
 * Selects a single dialogue strategy from the adaptive state using a fixed
 * priority order. Safety-related flags and distressed emotional states are
 * always resolved before any behavior-change strategy, so a user asking
 * about diagnosis/treatment, reporting an urgent symptom, or in crisis is
 * never routed into ordinary action-planning language.
 *
 * Priority (highest first):
 *   1. emotional_crisis            -> urgent_referral
 *   2. urgent_symptom              -> urgent_referral
 *   3. diagnosis/treatment request -> safety_boundary
 *   4. incorrect/partial understanding -> clarify_risk
 *   5. overwhelmed/worried emotion -> acknowledge_emotion
 *   6. any stated barrier          -> explore_barrier
 *   7. low self-efficacy           -> support_self_efficacy
 *   8. preparing/ready readiness   -> action_planning
 *   9. otherwise                   -> explore_readiness
 */
export function selectDialogueStrategy(state: AdaptiveState): DialogueStrategy {
  if (state.safetyFlag === 'emotional_crisis') {
    return 'urgent_referral';
  }

  if (state.safetyFlag === 'urgent_symptom') {
    return 'urgent_referral';
  }

  if (state.safetyFlag === 'diagnosis_request' || state.safetyFlag === 'treatment_request') {
    return 'safety_boundary';
  }

  if (state.understanding === 'incorrect' || state.understanding === 'partial') {
    return 'clarify_risk';
  }

  if (state.emotion === 'overwhelmed' || state.emotion === 'worried') {
    return 'acknowledge_emotion';
  }

  if (state.barrier !== 'none') {
    return 'explore_barrier';
  }

  if (state.selfEfficacy === 'low') {
    return 'support_self_efficacy';
  }

  if (state.readiness === 'preparing' || state.readiness === 'ready') {
    return 'action_planning';
  }

  return 'explore_readiness';
}
