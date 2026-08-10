/**
 * Validates a DialogueRoute before generation.
 */

import type { DialogueRoute, RouteValidation } from './types';

export interface ValidateRouteInput {
  route: DialogueRoute;
  latestMessage: string;
  stalePlanDetected?: boolean;
}

function hasEmotionEvidence(route: DialogueRoute): boolean {
  const evidence = route.currentTurnEvidence.emotion.trim().toLowerCase();
  return evidence.length > 0 && evidence !== 'not expressed' && evidence !== 'none';
}

function hasBarrierEvidence(route: DialogueRoute): boolean {
  const evidence = route.currentTurnEvidence.barrier.trim().toLowerCase();
  return evidence.length > 0 && evidence !== 'not expressed' && evidence !== 'none';
}

/**
 * Ensures emotion/barrier labels have current-turn evidence and the route
 * source matches the requested operation.
 */
export function validateRoute(input: ValidateRouteInput): RouteValidation {
  const { route } = input;
  const message = input.latestMessage.trim();

  const directQuestionDetected =
    /\?/.test(message) ||
    /^(what|why|how|does|is|should|can|would|will|put|translate|explain)\b/i.test(message) ||
    route.directAnswerRequired;

  const unsupportedEmotionDetected =
    route.emotion !== 'not_expressed' &&
    route.emotion !== 'none' &&
    !hasEmotionEvidence(route);

  const unsupportedBarrierDetected =
    route.barrier !== 'not_expressed' &&
    route.barrier !== 'none' &&
    !hasBarrierEvidence(route);

  const operationSupportedByEvidence =
    route.confidence >= 0.7 &&
    route.topic !== 'unclear' &&
    route.primaryOperation !== 'request_clarification';

  const currentTurnEvidenceConsistent =
    !unsupportedEmotionDetected &&
    !unsupportedBarrierDetected &&
    Boolean(route.currentTurnEvidence.topic) &&
    Boolean(route.currentTurnEvidence.operation);

  const latestRequestPreserved =
    route.explicitRequest.trim().length > 0 &&
    !(
      route.primaryOperation === 'explain' &&
      route.topic === 'risk_meaning' &&
      /call|work schedule|barrier/i.test(message)
    ) &&
    !(
      route.primaryOperation === 'provide_options' &&
      /out of|frequency|group of people|translate/i.test(message)
    );

  const routeSourceAppropriate = (() => {
    switch (route.primaryOperation) {
      case 'convert':
        return (
          route.deterministicCalculationRequired ||
          route.selectedInformationSource === 'deterministic_calculation'
        );
      case 'set_boundary':
        return (
          route.selectedInformationSource === 'safety_boundary_policy' ||
          route.selectedInformationSource === 'safety_boundary_and_rag'
        );
      case 'address_barrier':
      case 'defer':
      case 'confirm':
        return (
          route.selectedInformationSource === 'conversation_memory' ||
          route.selectedInformationSource === 'none'
        );
      case 'list_information':
      case 'answer_factual_question':
        return (
          route.selectedInformationSource === 'calculator_metadata' ||
          route.selectedInformationSource === 'vetted_medical_rag'
        );
      case 'draft':
      case 'revise':
      case 'review':
        return route.selectedInformationSource === 'draft_and_constraints';
      default:
        return true;
    }
  })();

  const stalePlanDetected = Boolean(input.stalePlanDetected);

  const valid =
    latestRequestPreserved &&
    operationSupportedByEvidence &&
    currentTurnEvidenceConsistent &&
    !unsupportedEmotionDetected &&
    !unsupportedBarrierDetected &&
    !stalePlanDetected &&
    routeSourceAppropriate;

  let reason: string | undefined;
  if (!valid) {
    if (unsupportedEmotionDetected) reason = 'unsupported_emotion_without_evidence';
    else if (unsupportedBarrierDetected) reason = 'unsupported_barrier_without_evidence';
    else if (stalePlanDetected) reason = 'stale_plan_detected';
    else if (!routeSourceAppropriate) reason = 'route_source_inappropriate';
    else if (!latestRequestPreserved) reason = 'latest_request_not_preserved';
    else if (!operationSupportedByEvidence) reason = 'operation_not_supported';
    else reason = 'route_validation_failed';
  }

  return {
    latestRequestPreserved,
    directQuestionDetected,
    operationSupportedByEvidence,
    currentTurnEvidenceConsistent,
    unsupportedEmotionDetected,
    unsupportedBarrierDetected,
    stalePlanDetected,
    routeSourceAppropriate,
    valid,
    reason,
  };
}
