import type { Intent } from '../behavioral/state';
import type { AdaptiveState } from '../behavioral/state';
import type { DecisionSupportState, DecisionSupportStrategy } from './types';

export interface SelectDecisionSupportStrategyInput {
  decisionState: DecisionSupportState;
  adaptiveState: AdaptiveState;
  primaryIntent: Intent;
  safetyOverride: boolean;
}

/**
 * Deterministic Ottawa Decision Support Framework–inspired strategy
 * selection. Groq never chooses this strategy.
 */
export function selectDecisionSupportStrategy(input: SelectDecisionSupportStrategyInput): DecisionSupportStrategy {
  const { decisionState, adaptiveState, primaryIntent, safetyOverride } = input;

  if (safetyOverride || adaptiveState.safetyFlag !== 'none') {
    return 'none';
  }

  if (primaryIntent === 'conversation_closing' || decisionState.decisionStage === 'closed') {
    return 'close_decision';
  }

  if (decisionState.decisionStage === 'deferred') {
    return 'support_deferral';
  }

  if (decisionState.draftStatus === 'rejected') {
    return 'support_deferral';
  }

  if (decisionState.decisionStage === 'action_confirmed' || primaryIntent === 'confirm_action') {
    return 'confirm_selected_action';
  }

  if (primaryIntent === 'confirm_proposed_action' || decisionState.draftStatus === 'accepted') {
    return 'confirm_selected_action';
  }

  if (primaryIntent === 'request_draft_review') {
    return 'review_draft';
  }

  if (primaryIntent === 'request_draft_help' || decisionState.draftStatus === 'revision_requested') {
    return 'prepare_questions';
  }

  switch (decisionState.primaryDecisionalNeed) {
    case 'missing_information':
      return 'provide_information';
    case 'unclear_options':
      return 'clarify_options';
    case 'unclear_preferences':
      return 'clarify_preferences';
    case 'low_confidence':
      return 'build_confidence';
    case 'insufficient_support':
      return decisionState.selectedOption ? 'prepare_questions' : 'clarify_options';
    case 'practical_barrier':
      return 'address_barrier';
    case 'emotional_barrier':
      return 'acknowledge_emotion_need';
    case 'resolved':
      if (decisionState.decisionStage === 'preparing_action' && !decisionState.draftAccepted) {
        return decisionState.selectedOption ? 'prepare_questions' : 'clarify_options';
      }
      return 'close_decision';
    default:
      if (primaryIntent === 'greeting') return 'none';
      return 'none';
  }
}
