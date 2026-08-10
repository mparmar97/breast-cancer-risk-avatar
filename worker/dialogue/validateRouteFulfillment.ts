/**
 * Validates that a generated reply fulfilled the active DialogueRoute.
 */

import type { DialogueRoute, RouteFulfillmentValidation } from '../routing/types';
import type { ResponsePlan } from './deriveResponsePlan';

export interface ValidateRouteFulfillmentInput {
  reply: string;
  route: DialogueRoute;
  plan?: ResponsePlan;
}

const NATURAL_FREQUENCY = /\b\d+(\.\d+)?\s+out of\s+\d+\b|\bout of\s+\d+\b/i;
const READINESS_MOVE =
  /\b(how do you (currently )?feel about discussing|what action feels realistic|are you ready to)\b/i;
const GENERIC_RISK_ONLY =
  /\brisk estimate (is|describes) (a )?probability\b/i;
const SCREENING_BOUNDARY =
  /\b(cannot|can'?t|do not|don't).{0,40}(recommend|advise|determine).{0,40}(screening|mammogram|mri)|individualized|qualified (healthcare )?professional|not (personalized|individual) (screening )?advice\b/i;
const BARRIER_MARKERS =
  /\b(time|schedule|work|call|calling|written|write|portal|message|busy|obstacle|manageable)\b/i;
const DEFERRAL_MARKERS =
  /\b(fine|whenever|no pressure|when you (are|feel) ready|leave .{0,20}open|do not have to|don't have to)\b/i;
const META_MARKERS =
  /\b(personal information|input|age|family history|calculator|demonstration|prototype|model)\b/i;
const LIMITATION_MARKERS =
  /\b(cannot predict|population|individual|not (a )?diagnosis|probability|certainty)\b/i;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function validateRouteFulfillment(
  input: ValidateRouteFulfillmentInput,
): RouteFulfillmentValidation {
  const { reply, route } = input;
  const missingElements: string[] = [];
  let requestedOperationCompleted = true;
  let staleTopicRepeated = false;
  let incompatibleDialogueMoveDetected = false;
  let sourceMismatchDetected = false;

  const directAnswerProvided = wordCount(reply.split('?')[0] ?? '') >= 4;

  switch (route.primaryOperation) {
    case 'convert':
      requestedOperationCompleted = NATURAL_FREQUENCY.test(reply);
      if (!requestedOperationCompleted) missingElements.push('natural frequency conversion');
      if (READINESS_MOVE.test(reply)) incompatibleDialogueMoveDetected = true;
      if (GENERIC_RISK_ONLY.test(reply) && !NATURAL_FREQUENCY.test(reply)) {
        incompatibleDialogueMoveDetected = true;
        missingElements.push('conversion instead of generic definition');
      }
      break;
    case 'verify_understanding':
      requestedOperationCompleted =
        /\b(right|correct|clear|understood|yes|accurate|got)\b/i.test(reply);
      if (NATURAL_FREQUENCY.test(reply) && wordCount(reply) > 45) {
        staleTopicRepeated = true;
        requestedOperationCompleted = false;
        missingElements.push('brief acknowledgment without full re-explanation');
      }
      break;
    case 'correct_misunderstanding':
      requestedOperationCompleted = LIMITATION_MARKERS.test(reply);
      if (!requestedOperationCompleted) missingElements.push('probability vs prediction correction');
      break;
    case 'address_barrier':
      requestedOperationCompleted = BARRIER_MARKERS.test(reply);
      if (NATURAL_FREQUENCY.test(reply) || GENERIC_RISK_ONLY.test(reply)) {
        staleTopicRepeated = true;
        requestedOperationCompleted = false;
        missingElements.push('barrier acknowledgment without risk re-explanation');
      }
      if (/\b(terrified|you (must be|are) (scared|afraid))\b/i.test(reply) && route.emotion === 'not_expressed') {
        incompatibleDialogueMoveDetected = true;
      }
      break;
    case 'set_boundary':
      if (route.topic === 'screening_guidance') {
        requestedOperationCompleted =
          SCREENING_BOUNDARY.test(reply) ||
          /\b(screening|mammogram|mri).{0,80}(professional|clinician|individual)\b/i.test(reply);
        if (GENERIC_RISK_ONLY.test(reply) && !SCREENING_BOUNDARY.test(reply)) {
          incompatibleDialogueMoveDetected = true;
          requestedOperationCompleted = false;
          missingElements.push('screening boundary instead of generic risk definition');
        }
        if (/\byou (should|need to) (get|have|schedule) (a )?(mammogram|mri)\b/i.test(reply)) {
          incompatibleDialogueMoveDetected = true;
          requestedOperationCompleted = false;
          missingElements.push('must not give personalized screening recommendation');
        }
      } else {
        requestedOperationCompleted = /\b(not a diagnosis|cannot diagnose|cannot recommend treatment)\b/i.test(
          reply,
        );
      }
      break;
    case 'defer':
      requestedOperationCompleted = DEFERRAL_MARKERS.test(reply) || wordCount(reply) >= 6;
      if (/\bwhen would you like to send\b/i.test(reply) || /\bsend it tonight\b/i.test(reply)) {
        incompatibleDialogueMoveDetected = true;
        requestedOperationCompleted = false;
        missingElements.push('acknowledge deferral without forcing timing');
      }
      break;
    case 'list_information':
    case 'answer_factual_question':
      requestedOperationCompleted = META_MARKERS.test(reply) || LIMITATION_MARKERS.test(reply);
      if (!requestedOperationCompleted) missingElements.push('calculator metadata or source facts');
      break;
    case 'compare':
      requestedOperationCompleted =
        /\bfive[- ]?year\b/i.test(reply) && /\blifetime\b/i.test(reply);
      break;
    case 'explain':
      requestedOperationCompleted = wordCount(reply) >= 8;
      if (route.topic === 'risk_meaning' && READINESS_MOVE.test(reply)) {
        incompatibleDialogueMoveDetected = true;
      }
      break;
    case 'draft':
    case 'revise':
      requestedOperationCompleted =
        /\b(draft|here is|hello|hi,)\b/i.test(reply) || /"[^"]{15,}"/.test(reply);
      break;
    default:
      requestedOperationCompleted = wordCount(reply) >= 6;
  }

  if (
    route.selectedInformationSource === 'deterministic_calculation' &&
    route.primaryOperation === 'convert' &&
    !NATURAL_FREQUENCY.test(reply)
  ) {
    sourceMismatchDetected = true;
  }

  const routeFulfilled =
    requestedOperationCompleted &&
    directAnswerProvided &&
    !staleTopicRepeated &&
    !incompatibleDialogueMoveDetected &&
    !sourceMismatchDetected;

  let reason: string | undefined;
  if (!routeFulfilled) {
    if (staleTopicRepeated) reason = 'stale_topic_repeated';
    else if (incompatibleDialogueMoveDetected) reason = 'incompatible_dialogue_move';
    else if (sourceMismatchDetected) reason = 'source_mismatch';
    else if (!requestedOperationCompleted) reason = 'requested_operation_incomplete';
    else if (!directAnswerProvided) reason = 'direct_answer_missing';
  }

  return {
    routeFulfilled,
    directAnswerProvided,
    requestedOperationCompleted,
    staleTopicRepeated,
    incompatibleDialogueMoveDetected,
    sourceMismatchDetected,
    valid: routeFulfilled,
    reason,
    missingElements,
  };
}

export function buildRouteFulfillmentRepairInstruction(
  validation: RouteFulfillmentValidation,
  route: DialogueRoute,
): string {
  return JSON.stringify(
    {
      failure: validation.reason ?? 'route_not_fulfilled',
      required_topic: route.topic,
      required_operation: route.primaryOperation,
      explicit_request: route.explicitRequest,
      missing_elements: validation.missingElements,
      must_not_do: [
        validation.staleTopicRepeated ? 'repeat stale risk explanation' : null,
        validation.incompatibleDialogueMoveDetected ? 'incompatible dialogue move' : null,
        'invent unsupported emotion or barrier',
      ].filter(Boolean),
    },
    null,
    2,
  );
}
