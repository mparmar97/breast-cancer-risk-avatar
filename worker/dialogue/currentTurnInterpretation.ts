/**
 * Compatibility adapter: SemanticTurn → RequestInterpretation.
 * Production logic lives in semanticTurn.ts (feature-based, not sentence lists).
 * Exact example sentences belong in tests only.
 */

import type { RiskResult } from '../types';
import {
  interpretSemanticTurnLocal,
  shouldSkipMedicalRagForSemantic,
  shouldUseSemanticFallback,
  type DomainTopic,
  type SemanticTurn,
  type UserOperation,
} from './semanticTurn';
import type { PendingConversationItem } from './types';

export type ConversationTopic =
  | 'risk_meaning'
  | 'risk_value'
  | 'natural_frequency'
  | 'time_horizon'
  | 'risk_comparison'
  | 'calculator_inputs'
  | 'calculator_limitations'
  | 'calculator_applicability'
  | 'evidence_source'
  | 'decision_support'
  | 'communication_option'
  | 'message_drafting'
  | 'draft_review'
  | 'action_planning'
  | 'emotion'
  | 'barrier'
  | 'safety'
  | 'greeting'
  | 'closing'
  | 'out_of_scope'
  | 'unclear';

export type RequestedOperation =
  | 'explain'
  | 'simplify'
  | 'convert'
  | 'compare'
  | 'summarize'
  | 'clarify'
  | 'verify_understanding'
  | 'correct_misunderstanding'
  | 'list_information'
  | 'identify_limitation'
  | 'answer_factual_question'
  | 'provide_options'
  | 'clarify_preference'
  | 'draft'
  | 'review'
  | 'revise'
  | 'shorten'
  | 'change_tone'
  | 'plan_action'
  | 'confirm_action'
  | 'acknowledge'
  | 'close'
  | 'set_boundary'
  | 'request_clarification';

export interface TurnEntities {
  riskValue?: number;
  denominator?: number;
  timeHorizon?: string;
  comparisonTarget?: string;
  draftText?: string;
  selectedOption?: string;
  timing?: string;
}

export interface RequestInterpretation {
  topic: ConversationTopic;
  operation: RequestedOperation;
  secondaryOperations: RequestedOperation[];
  primaryIntent: string;
  secondaryIntents: string[];
  explicitRequest: string;
  requestedOutputFormat?: string;
  entities: TurnEntities;
  currentTurnEvidence: {
    topic: string;
    operation: string;
    explicitRequest: string;
  };
  requiresMedicalEvidence: boolean;
  requiresCalculation: boolean;
  requiresConversationContext: boolean;
  requiresClarification: boolean;
  confidence: number;
  classificationMode: 'groq-structured' | 'local-semantic-fallback' | 'local-fallback';
  /** Full semantic turn when available. */
  semanticTurn?: SemanticTurn;
}

export type CurrentTurnInterpretation = RequestInterpretation;

export interface InterpretCurrentTurnRequestInput {
  latestMessage: string;
  riskResult?: RiskResult;
  pendingItem?: PendingConversationItem;
  previousAssistantReply?: string;
  previousDraftPending?: boolean;
}

function mapTopic(topic: DomainTopic): ConversationTopic {
  switch (topic) {
    case 'risk_meaning':
      return 'risk_meaning';
    case 'risk_representation':
      return 'natural_frequency';
    case 'risk_level':
      return 'risk_meaning';
    case 'professional_interpretation':
      return 'decision_support';
    case 'communication_support':
      return 'barrier';
    case 'calculator_validation':
    case 'calculator_result_source':
      return 'calculator_applicability';
    case 'screening_guidance':
      return 'safety';
    default:
      return topic as ConversationTopic;
  }
}

function mapOperation(op: UserOperation, turn: SemanticTurn): RequestedOperation {
  switch (op) {
    case 'convert':
      return 'convert';
    case 'verify_understanding':
      return 'verify_understanding';
    case 'correct_misunderstanding':
      return 'correct_misunderstanding';
    case 'compare':
      return 'compare';
    case 'summarize':
      return 'summarize';
    case 'explain':
      return 'explain';
    case 'simplify':
      return 'simplify';
    case 'list_information':
      return 'list_information';
    case 'answer_factual_question':
      return 'answer_factual_question';
    case 'identify_limitation':
      return 'identify_limitation';
    case 'draft':
      return 'draft';
    case 'revise':
      return 'revise';
    case 'review':
      return 'review';
    case 'confirm':
      return 'confirm_action';
    case 'defer':
      return turn.stance === 'rejecting' ? 'acknowledge' : 'acknowledge';
    case 'address_barrier':
      return 'clarify_preference';
    case 'provide_options':
      return 'provide_options';
    case 'plan':
      return turn.userConstraints.includes('one simple step') || turn.barrier === 'delay'
        ? 'plan_action'
        : 'provide_options';
    case 'clarify_preference':
      return 'clarify_preference';
    case 'elaborate':
      if (turn.topic === 'emotion' || turn.topic === 'greeting') return 'acknowledge';
      return 'explain';
    case 'close':
      return 'close';
    case 'set_boundary':
      return 'set_boundary';
    case 'reject':
      return 'acknowledge';
    case 'request_clarification':
      return 'request_clarification';
    default:
      return 'clarify';
  }
}

function mapSecondary(ops: UserOperation[], turn: SemanticTurn): RequestedOperation[] {
  return ops.map((op) => {
    if (op === 'summarize' && (turn.primaryOperation === 'revise' || turn.primaryOperation === 'draft')) {
      return 'shorten';
    }
    if (op === 'revise' && turn.primaryOperation === 'draft') return 'change_tone';
    if (op === 'identify_limitation') return 'identify_limitation';
    if (op === 'elaborate' && turn.emotion !== 'not_expressed') return 'acknowledge';
    return mapOperation(op, turn);
  });
}

function mapIntent(turn: SemanticTurn): { primary: string; secondary: string[] } {
  const secondary: string[] = [];
  if (turn.emotion !== 'not_expressed') secondary.push('express_emotion');

  if (turn.topic === 'greeting') return { primary: 'greeting', secondary };
  if (turn.topic === 'emotion') return { primary: 'express_emotion', secondary };

  switch (turn.primaryOperation) {
    case 'convert':
    case 'explain':
    case 'simplify':
    case 'elaborate':
      return { primary: 'explain_risk', secondary };
    case 'compare':
      return { primary: 'explain_risk_horizon', secondary };
    case 'verify_understanding':
      return { primary: 'confirm_understanding', secondary };
    case 'correct_misunderstanding':
      return { primary: 'explain_risk', secondary };
    case 'list_information':
    case 'answer_factual_question':
    case 'identify_limitation':
      return { primary: 'general_question', secondary };
    case 'draft':
    case 'revise':
      return {
        primary: 'request_draft_help',
        secondary,
      };
    case 'confirm':
      return {
        primary: turn.topic === 'message_drafting' ? 'confirm_proposed_action' : 'confirm_action',
        secondary,
      };
    case 'defer':
      return { primary: 'express_ambivalence', secondary };
    case 'reject':
      return { primary: 'express_ambivalence', secondary };
    case 'address_barrier':
      return { primary: 'describe_barrier', secondary };
    case 'provide_options':
    case 'plan':
    case 'clarify_preference':
      return {
        primary: turn.barrier !== 'not_expressed' && turn.barrier !== 'none'
          ? 'describe_barrier'
          : 'request_next_step',
        secondary,
      };
    case 'close':
      return { primary: 'conversation_closing', secondary };
    case 'set_boundary':
      return { primary: 'diagnosis_question', secondary };
    case 'request_clarification':
      return { primary: 'unclear', secondary };
    default:
      return { primary: 'unclear', secondary };
  }
}

/**
 * Converts a SemanticTurn into the legacy RequestInterpretation shape.
 */
export function requestInterpretationFromSemantic(turn: SemanticTurn): RequestInterpretation {
  const intents = mapIntent(turn);
  const operation = mapOperation(turn.primaryOperation, turn);
  let secondaryOperations = mapSecondary(turn.secondaryOperations, turn);
  const constraints = turn.constraints.length > 0 ? turn.constraints : turn.userConstraints;

  // Fresh draft creation: apply format constraints from semantic fields only.
  if (turn.topic === 'message_drafting' && turn.primaryOperation === 'draft') {
    secondaryOperations = [];
    if (constraints.some((c) => /short/.test(c))) secondaryOperations.push('shorten');
    if (constraints.some((c) => /formal/.test(c))) secondaryOperations.push('change_tone');
  }

  const format =
    turn.requestedFormat ??
    constraints.find((c) => /natural frequency|two short|one simple|short conversational|brief|simple language/.test(c)) ??
    (operation === 'convert'
      ? 'natural frequency'
      : operation === 'verify_understanding'
        ? 'brief acknowledgment'
        : undefined);

  return {
    topic:
      operation === 'draft' || operation === 'revise'
        ? 'message_drafting'
        : operation === 'confirm_action' && turn.topic === 'message_drafting'
          ? 'draft_review'
          : operation === 'plan_action'
            ? 'barrier'
            : mapTopic(turn.topic),
    operation:
      turn.primaryOperation === 'draft'
        ? 'draft'
        : turn.topic === 'calculator_inputs'
          ? 'list_information'
          : operation,
    secondaryOperations:
      turn.primaryOperation === 'draft'
        ? secondaryOperations
        : turn.topic === 'calculator_inputs' && turn.secondaryOperations.includes('identify_limitation')
          ? ['identify_limitation']
          : secondaryOperations,
    primaryIntent: intents.primary,
    secondaryIntents: intents.secondary,
    explicitRequest: turn.explicitRequest,
    requestedOutputFormat: format ?? turn.requestedOutputFormat ?? turn.requestedFormat,
    entities: {
      riskValue: turn.entities.riskValue,
      denominator: turn.entities.denominator,
      timeHorizon: turn.entities.timeHorizon,
      draftText: turn.entities.draftText,
      selectedOption: turn.entities.selectedOption,
      timing: turn.entities.timing,
      comparisonTarget:
        turn.topic === 'time_horizon' ? 'five-year vs lifetime' : undefined,
    },
    currentTurnEvidence: {
      topic: turn.currentTurnEvidence.topic,
      operation: turn.currentTurnEvidence.operation,
      explicitRequest: turn.currentTurnEvidence.explicitRequest,
    },
    requiresMedicalEvidence: turn.requiresMedicalEvidence,
    requiresCalculation: turn.requiresCalculation || turn.requiresDeterministicCalculation,
    requiresConversationContext: turn.requiresConversationContext,
    requiresClarification: turn.requiresClarification,
    confidence: turn.confidence,
    classificationMode:
      turn.classificationMode === 'local-fallback'
        ? 'local-semantic-fallback'
        : turn.classificationMode,
    semanticTurn: turn,
  };
}

/**
 * Interpret the latest turn via the semantic feature schema (local path).
 */
export function interpretCurrentTurnRequest(
  input: InterpretCurrentTurnRequestInput,
): RequestInterpretation {
  const semantic = interpretSemanticTurnLocal(input);
  return requestInterpretationFromSemantic(semantic);
}

export function shouldSkipMedicalRag(interpretation: RequestInterpretation): boolean {
  if (interpretation.semanticTurn) {
    return shouldSkipMedicalRagForSemantic(interpretation.semanticTurn);
  }
  return shouldSkipMedicalRagForSemantic(
    interpretSemanticTurnLocal({
      latestMessage: interpretation.explicitRequest,
    }),
  );
}

export function shouldUseOperationFallback(interpretation: RequestInterpretation): boolean {
  if (interpretation.semanticTurn) {
    return shouldUseSemanticFallback(interpretation.semanticTurn);
  }
  if (interpretation.confidence < 0.75) return false;
  if (interpretation.topic === 'unclear') return false;
  if (interpretation.operation === 'request_clarification') return false;
  if (interpretation.topic === 'emotion') return false;
  if (interpretation.topic === 'barrier' && interpretation.requestedOutputFormat !== 'one simple step') {
    return false;
  }
  return true;
}
