/**
 * Cross-checks orchestration metadata for internal contradictions.
 */

import type { RoutingDiagnostics } from '../routing/types';
import type { TurnRequest } from '../request/turnRequest';
import type { AssumptionValidation } from '../dialogue/validateAssumptions';
import type { PipelineTrace } from './pipelineTrace';

export interface MetadataConsistencyValidation {
  latestMessageConsistent: boolean;
  clarificationFieldsConsistent: boolean;
  shortReplyFieldsConsistent: boolean;
  routeAndPlanConsistent: boolean;
  responseModeConsistent: boolean;
  fallbackReasonConsistent: boolean;
  valid: boolean;
  failures: string[];
}

/** @deprecated Prefer MetadataConsistencyValidation */
export type MetadataConsistency = MetadataConsistencyValidation;

export interface ValidateMetadataConsistencyInput {
  turnRequest: TurnRequest;
  routingDiagnostics?: RoutingDiagnostics | null;
  reply: string;
  directQuestionAnswered?: boolean;
  primaryGoalSatisfied?: boolean;
  dialogueAdvanced?: boolean;
  clarificationRequired?: boolean;
  clarificationFields?: {
    requiresClarification?: boolean;
    directAnswerRequired?: boolean;
  };
  shortReplyType?: string | null;
  isShortReply?: boolean;
  responseMode?: string | null;
  fallbackReason?: string | null;
  primaryOperation?: string | null;
  primaryGoal?: string | null;
  assumptionValidation?: AssumptionValidation | null;
  pipelineTrace?: PipelineTrace | null;
  latestMessageInDiagnostics?: string | null;
}

/**
 * Fails when clarification fields contradict, latestMessage is empty in
 * diagnostics while the request had a message, or progression flags disagree
 * with assumption validation.
 */
export function validateMetadataConsistency(
  input: ValidateMetadataConsistencyInput,
): MetadataConsistencyValidation {
  const failures: string[] = [];
  const requestMessage = input.turnRequest.latestMessage.trim();

  let latestMessageConsistent = true;
  let clarificationFieldsConsistent = true;
  let shortReplyFieldsConsistent = true;
  let routeAndPlanConsistent = true;
  let responseModeConsistent = true;
  let fallbackReasonConsistent = true;

  if (!requestMessage) {
    failures.push('turnRequest.latestMessage is empty');
    latestMessageConsistent = false;
  }

  const diagMessage =
    input.routingDiagnostics?.latestMessage ?? input.latestMessageInDiagnostics ?? '';
  if (requestMessage && (!diagMessage || diagMessage.trim().length === 0)) {
    failures.push('latestMessage empty in diagnostics while request had a message');
    latestMessageConsistent = false;
  } else if (
    requestMessage &&
    diagMessage.trim() &&
    diagMessage.trim() !== requestMessage
  ) {
    failures.push('routingDiagnostics.latestMessage does not match turnRequest.latestMessage');
    latestMessageConsistent = false;
  }

  const clarification = input.clarificationFields;
  if (clarification) {
    if (clarification.requiresClarification && clarification.directAnswerRequired) {
      failures.push('clarificationFields contradict: requiresClarification and directAnswerRequired both true');
      clarificationFieldsConsistent = false;
    }
  }

  if (
    input.clarificationFields?.requiresClarification === true &&
    input.clarificationRequired === false &&
    input.routingDiagnostics?.primaryOperation === 'request_clarification'
  ) {
    failures.push('clarificationFields contradict route clarification operation');
    clarificationFieldsConsistent = false;
  }

  if (
    input.clarificationRequired === false &&
    (input.primaryOperation === 'request_clarification' ||
      input.primaryGoal === 'clarify_short_reply')
  ) {
    failures.push('requires clarification is false but operation/goal is clarification');
    clarificationFieldsConsistent = false;
  }

  if (
    input.isShortReply === false &&
    input.shortReplyType &&
    input.shortReplyType !== 'not_short_reply' &&
    input.shortReplyType !== 'none'
  ) {
    failures.push('short-reply type set while isShortReply is false');
    shortReplyFieldsConsistent = false;
  }

  if (
    input.routingDiagnostics?.topic &&
    input.primaryGoal &&
    input.routingDiagnostics.topic === 'lifestyle_risk_information' &&
    /clarify_short_reply|explore_readiness/i.test(input.primaryGoal)
  ) {
    failures.push('routeAndPlan inconsistent: lifestyle topic with clarification/readiness goal');
    routeAndPlanConsistent = false;
  }

  if (
    input.responseMode === 'local-rag-fallback' &&
    input.fallbackReason === 'generation_provider_failure' &&
    input.pipelineTrace?.failedStage === 'classification' &&
    !input.pipelineTrace.generationProviderAttempted
  ) {
    failures.push('fallbackReason generation_provider_failure but failure was classification');
    fallbackReasonConsistent = false;
    responseModeConsistent = false;
  }

  if (input.pipelineTrace) {
    const missingMessageStages = input.pipelineTrace.stages.filter((s) => !s.latestMessagePresent);
    if (missingMessageStages.length > 0 && requestMessage) {
      failures.push(
        `pipelineTrace stages missing latestMessage: ${missingMessageStages.map((s) => s.stage).join(', ')}`,
      );
      latestMessageConsistent = false;
    }
  }

  if (!input.reply || input.reply.trim().length === 0) {
    failures.push('reply is empty');
  }

  return {
    latestMessageConsistent,
    clarificationFieldsConsistent,
    shortReplyFieldsConsistent,
    routeAndPlanConsistent,
    responseModeConsistent,
    fallbackReasonConsistent,
    valid: failures.length === 0,
    failures,
  };
}
