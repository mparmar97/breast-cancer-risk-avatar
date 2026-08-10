/**
 * Active information need derived from the latest semantic turn.
 * Does not invent missing_information when the user only expresses emotion/barrier.
 */

import type { ConversationMemory } from './conversationMemory';
import type { SemanticOperation, SemanticTopic, SemanticTurn } from './semanticTurn';
import type { RiskResult } from '../types';

export interface ActiveInformationNeed {
  topic: SemanticTopic;
  operation: SemanticOperation;
  unresolvedQuestion: string;
  requestedInformation: string[];
  resolved: boolean;
  resolvedAtTurn?: number;
  sourceRequired:
    | 'calculator_metadata'
    | 'deterministic_calculation'
    | 'medical_rag'
    | 'conversation_memory'
    | 'safety_policy'
    | 'none';
  currentTurnPriority: number;
}

export interface DeriveActiveInformationNeedInput {
  semanticTurn: SemanticTurn;
  riskResult?: RiskResult;
  conversationMemory?: ConversationMemory;
}

const INFO_OPS: SemanticOperation[] = [
  'explain',
  'simplify',
  'convert',
  'compare',
  'correct_misunderstanding',
  'answer_factual_question',
  'list_information',
  'identify_limitation',
  'verify_understanding',
  'elaborate',
  'provide_options',
  'set_boundary',
];

function isDirectInformationSeeking(turn: SemanticTurn): boolean {
  if (turn.requiresClarification || turn.topic === 'unclear') return false;
  if (turn.topic === 'emotion' || turn.topic === 'greeting' || turn.topic === 'closing') return false;
  if (
    turn.primaryOperation === 'address_barrier' ||
    turn.primaryOperation === 'defer' ||
    turn.primaryOperation === 'reject' ||
    turn.primaryOperation === 'confirm' ||
    turn.primaryOperation === 'close' ||
    turn.primaryOperation === 'draft' ||
    turn.primaryOperation === 'revise' ||
    turn.primaryOperation === 'review'
  ) {
    // Emotion/barrier/draft moves alone are not unresolved information questions.
    return false;
  }
  return (
    INFO_OPS.includes(turn.primaryOperation) &&
    (turn.stance === 'asking' ||
      turn.stance === 'correcting' ||
      turn.primaryOperation === 'correct_misunderstanding' ||
      turn.userQuestions.length > 0 ||
      Boolean(turn.explicitRequest))
  );
}

function mapSource(turn: SemanticTurn): ActiveInformationNeed['sourceRequired'] {
  if (turn.primaryOperation === 'convert' || turn.requiresCalculation || turn.requiresDeterministicCalculation) {
    return 'deterministic_calculation';
  }
  if (
    turn.topic === 'calculator_inputs' ||
    turn.topic === 'calculator_validation' ||
    turn.topic === 'calculator_result_source' ||
    turn.topic === 'calculator_applicability' ||
    turn.requiresCalculatorMetadata
  ) {
    return 'calculator_metadata';
  }
  if (
    turn.topic === 'screening_guidance' ||
    turn.topic === 'safety' ||
    turn.topic === 'symptom_guidance' ||
    turn.requiresSafetyBoundary ||
    turn.primaryOperation === 'set_boundary'
  ) {
    return 'safety_policy';
  }
  if (
    turn.primaryOperation === 'address_barrier' ||
    turn.primaryOperation === 'draft' ||
    turn.primaryOperation === 'revise' ||
    turn.primaryOperation === 'review' ||
    turn.primaryOperation === 'confirm' ||
    turn.primaryOperation === 'reject' ||
    turn.primaryOperation === 'defer' ||
    turn.topic === 'message_drafting' ||
    turn.topic === 'communication_support' ||
    turn.topic === 'action_planning' ||
    turn.topic === 'conversation_summary'
  ) {
    return 'conversation_memory';
  }
  if (turn.requiresMedicalEvidence) return 'medical_rag';
  return 'none';
}

function requestedInformationFor(turn: SemanticTurn): string[] {
  const items: string[] = [];
  if (turn.primaryOperation === 'convert') items.push('natural frequency conversion');
  if (turn.topic === 'risk_level') items.push('risk level meaning');
  if (turn.topic === 'risk_meaning') items.push('risk estimate meaning');
  if (turn.topic === 'time_horizon') items.push('five-year versus lifetime');
  if (turn.requiresCalculatorMetadata) items.push('calculator metadata');
  if (turn.misunderstanding && turn.misunderstanding !== 'none' && turn.misunderstanding !== 'not_expressed') {
    items.push(`correction:${turn.misunderstanding}`);
  }
  if (items.length === 0 && turn.explicitRequest) items.push(turn.explicitRequest);
  return items;
}

/**
 * Derives the active information need for the current turn.
 * Never invents an unresolved question from emotion/barrier alone.
 */
export function deriveActiveInformationNeed(
  input: DeriveActiveInformationNeedInput,
): ActiveInformationNeed {
  void input.riskResult;
  void input.conversationMemory;
  const turn = input.semanticTurn;
  const seeking = isDirectInformationSeeking(turn);
  const unresolvedQuestion = seeking ? turn.explicitRequest.trim() : '';

  if (!seeking || !unresolvedQuestion) {
    return {
      topic: turn.topic,
      operation: turn.primaryOperation,
      unresolvedQuestion: '',
      requestedInformation: [],
      resolved: true,
      sourceRequired: 'none',
      currentTurnPriority: 0,
    };
  }

  return {
    topic: turn.topic,
    operation: turn.primaryOperation,
    unresolvedQuestion,
    requestedInformation: requestedInformationFor(turn),
    resolved: false,
    sourceRequired: mapSource(turn),
    currentTurnPriority: turn.directAnswerRequired ? 1 : 0.5,
  };
}

export interface DecisionNeedLike {
  primaryDecisionalNeed?: string | null;
  unresolvedQuestion?: string | null;
}

/**
 * If primary need is missing_information, unresolvedQuestion must be non-empty;
 * otherwise clear the need to none.
 */
export function assertMissingInformationConsistency<T extends DecisionNeedLike>(
  decisionNeed: T,
  activeNeed: ActiveInformationNeed,
): T {
  if (decisionNeed.primaryDecisionalNeed !== 'missing_information') {
    return decisionNeed;
  }

  const unresolved =
    (decisionNeed.unresolvedQuestion && decisionNeed.unresolvedQuestion.trim()) ||
    activeNeed.unresolvedQuestion.trim();

  if (!unresolved) {
    return {
      ...decisionNeed,
      primaryDecisionalNeed: 'none',
      unresolvedQuestion: null,
    };
  }

  return {
    ...decisionNeed,
    unresolvedQuestion: unresolved,
  };
}
