import type { Intent } from '../behavioral/state';
import type {
  DecisionSupportGoal,
  DecisionSupportState,
  DecisionSupportStrategy,
  DecisionSupportTurnPlan,
} from './types';

export interface PlanDecisionSupportTurnInput {
  decisionState: DecisionSupportState;
  decisionSupportStrategy: DecisionSupportStrategy;
  primaryIntent: Intent;
}

const BASE_MUST_NOT_ASSUME = [
  'that the user has already scheduled an appointment',
  'that a specific medical decision has been made for the user',
  'that treatment or medication is required',
  'that the demonstration estimate is a clinically validated personal result',
];

function goalFor(strategy: DecisionSupportStrategy): DecisionSupportGoal {
  switch (strategy) {
    case 'provide_information':
      return 'supply_missing_information';
    case 'clarify_options':
      return 'clarify_available_options';
    case 'clarify_preferences':
      return 'clarify_preferences';
    case 'build_confidence':
      return 'strengthen_decision_confidence';
    case 'prepare_questions':
      return 'prepare_communication';
    case 'address_barrier':
      return 'address_decisional_barrier';
    case 'acknowledge_emotion_need':
      return 'acknowledge_emotional_need';
    case 'support_deferral':
      return 'support_decision_deferral';
    case 'confirm_selected_action':
      return 'confirm_action_commitment';
    case 'review_draft':
      return 'review_communication_draft';
    case 'close_decision':
      return 'close_supportively';
    default:
      return 'none';
  }
}

/**
 * Plans what decision-support work the reply must accomplish before wording
 * is generated. Does not write the reply.
 */
export function planDecisionSupportTurn(input: PlanDecisionSupportTurnInput): DecisionSupportTurnPlan {
  const { decisionState, decisionSupportStrategy, primaryIntent } = input;
  const primaryGoal = goalFor(decisionSupportStrategy);
  const mustNotAssume = [...BASE_MUST_NOT_ASSUME];
  const mustAddress: string[] = [];
  const preserveSelectedOption = Boolean(decisionState.selectedOption);

  if (preserveSelectedOption && decisionState.selectedOption) {
    mustAddress.push(`preserve the already selected option: ${decisionState.selectedOption}`);
    mustNotAssume.push('that the user still needs to choose among basic contact options');
  }

  if (decisionState.informationNeedResolved) {
    mustNotAssume.push('that the risk percentage still needs a full re-explanation');
  }

  if (decisionState.draftAccepted) {
    mustNotAssume.push('that the draft still needs a full rewrite or that risk education must restart');
  }

  switch (decisionSupportStrategy) {
    case 'provide_information':
      mustAddress.push('the missing information about the demonstration risk result');
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: true,
      };
    case 'clarify_options':
      mustAddress.push('neutral, non-clinical communication options the user may choose');
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: !preserveSelectedOption,
      };
    case 'clarify_preferences':
      mustAddress.push('help the user clarify which optional approach fits their situation');
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        // If an option is already known, deliver support instead of re-asking.
        shouldAskQuestion: !preserveSelectedOption,
      };
    case 'prepare_questions':
      mustAddress.push(
        preserveSelectedOption
          ? `practical help preparing communication via ${decisionState.selectedOption}`
          : 'practical help preparing questions or a message draft',
      );
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: false,
      };
    case 'review_draft':
      mustAddress.push('whether the draft wording is clear and appropriate');
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: true,
      };
    case 'confirm_selected_action':
      mustAddress.push(
        decisionState.draftAccepted
          ? 'acknowledge that the draft has been accepted and the selected option is preserved'
          : 'recognize the confirmed action without asking when again if timing is known',
      );
      if (decisionState.actionTiming) {
        mustNotAssume.push('that the user still needs to choose a time');
      }
      mustNotAssume.push(
        'that the user wants to reopen readiness exploration',
        'that the user needs to choose a communication method again',
      );
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: decisionState.draftAccepted && !decisionState.actionTiming,
      };
    case 'support_deferral':
      mustAddress.push('respect the decision to wait without pressure');
      mustNotAssume.push('that immediate action is required');
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: false,
      };
    case 'address_barrier':
      mustAddress.push(`the current practical decisional barrier: ${decisionState.primaryDecisionalNeed}`);
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: true,
      };
    case 'acknowledge_emotion_need':
      mustAddress.push('brief acknowledgment of the emotional decisional barrier without replacing a primary informational request');
      return {
        primaryGoal,
        secondaryGoal: primaryIntent === 'request_next_step' ? 'still fulfill the next-step request' : undefined,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: true,
      };
    case 'close_decision':
      mustAddress.push('close supportively without opening a new decision pressure');
      return {
        primaryGoal,
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: false,
      };
    default:
      return {
        primaryGoal: 'none',
        mustAddress,
        mustNotAssume,
        preserveSelectedOption,
        shouldAskQuestion: false,
      };
  }
}
