import type { NaturalFrequencyResult } from '../risk/convertRiskToNaturalFrequency';
import type { RequestInterpretation } from './currentTurnInterpretation';
import type { DialogueTurnPlan } from './types';

export interface OperationValidation {
  explicitRequestAddressed: boolean;
  primaryOperationCompleted: boolean;
  secondaryOperationsCompleted: boolean;
  requestedFormatUsed: boolean;
  directAnswerProvided: boolean;
  genericSubstitutionDetected: boolean;
  unsupportedMedicalClaimDetected: boolean;
  unnecessaryQuestionDetected: boolean;
  currentBarrierAddressed?: boolean;
  resolvedRiskExplanationRepeated?: boolean;
  currentTurnPriorityPreserved?: boolean;
  unsupportedEmotionDetected?: boolean;
  dialogueAdvanced?: boolean;
  valid: boolean;
  reason?: string;
  missingElements: string[];
  mustNotRepeat: string[];
}

export interface ValidateOperationFulfillmentInput {
  reply: string;
  interpretation: RequestInterpretation;
  plan?: DialogueTurnPlan;
  calculation?: NaturalFrequencyResult | null;
  shouldAskQuestion: boolean;
}

const GENERIC_RISK_ONLY_PATTERN =
  /\brisk estimate (is|describes) (a )?probability\b/i;
const NATURAL_FREQUENCY_PATTERN = /\babout\s+\d+\s+out of\s+\d+\b|\b\d+\s+out of\s+\d+\b/i;
const FIVE_YEAR_PATTERN =
  /\b(five[- ]?years?|5[- ]?years?|over five years|during five years|over 5 years)\b/i;
const INPUTS_PATTERN =
  /\b(age|family history|biopsy|race|ethnicity|input|factor|information used)\b/i;
const LIMITATION_PATTERN =
  /\b(cannot predict|can'?t predict|population|individual|not (a )?diagnosis|uncertainty|does not mean)\b/i;
const COMPARE_BOTH =
  /\bfive[- ]?year\b[\s\S]{0,200}\blifetime\b|\blifetime\b[\s\S]{0,200}\bfive[- ]?year\b/i;
const DRAFT_BODY_PATTERN =
  /\b(here is|editable draft|hello[,:]?)\b/i;
const ACK_PATTERN =
  /\b(that('?s| is) (right|correct|a clear|accurate)|you('?ve| have) (got|understood)|yes[,.]|correct|makes sense|clear understanding)\b/i;
const MULTI_LIST_PATTERN = /(^|\n)\s*[-*•]\s+|\b(1\.|2\.|3\.)\s+/;
const DIAGNOSIS_CLAIM = /\byou have (breast )?cancer\b/i;

function countQuestions(text: string): number {
  const withoutQuoted = text.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ');
  return (withoutQuoted.match(/\?/g) ?? []).length;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Validates whether a reply fulfilled the interpreted requested operation.
 */
export function validateOperationFulfillment(
  input: ValidateOperationFulfillmentInput,
): OperationValidation {
  const { reply, interpretation, calculation, shouldAskQuestion } = input;
  const missingElements: string[] = [];
  const mustNotRepeat: string[] = [];
  let primaryOperationCompleted = true;
  let secondaryOperationsCompleted = true;
  let requestedFormatUsed = true;
  let genericSubstitutionDetected = false;
  let unnecessaryQuestionDetected = false;

  const unsupportedMedicalClaimDetected = DIAGNOSIS_CLAIM.test(reply);
  const hasQuestion = countQuestions(reply) > 0;
  if (!shouldAskQuestion && hasQuestion) {
    // Soft: only flag common filler questions when the plan said no question.
    if (
      /\bdoes that help\b/i.test(reply) ||
      /\bhow do you (currently )?feel\b/i.test(reply) ||
      /\bwhat action feels realistic\b/i.test(reply)
    ) {
      unnecessaryQuestionDetected = true;
    }
  }
  if (countQuestions(reply) > 1) {
    unnecessaryQuestionDetected = true;
  }

  switch (interpretation.operation) {
    case 'convert': {
      const hasFrequency = NATURAL_FREQUENCY_PATTERN.test(reply);
      const expectsFiveYear =
        /five|5\s*year/i.test(interpretation.entities.timeHorizon ?? '') ||
        /five|5\s*year/i.test(calculation?.timeHorizon ?? '');
      const hasHorizon = expectsFiveYear ? FIVE_YEAR_PATTERN.test(reply) : true;
      if (!hasFrequency) {
        primaryOperationCompleted = false;
        missingElements.push('natural frequency');
      }
      if (!hasHorizon) {
        missingElements.push('five-year horizon');
        primaryOperationCompleted = false;
      }
      if (GENERIC_RISK_ONLY_PATTERN.test(reply) && !hasFrequency) {
        genericSubstitutionDetected = true;
        primaryOperationCompleted = false;
        mustNotRepeat.push('generic probability definition');
      }
      if (/\b\d+(\.\d+)?%\b/.test(reply) && !hasFrequency && /\bwithout .{0,20}percentage/.test(interpretation.explicitRequest)) {
        primaryOperationCompleted = false;
        missingElements.push('conversion without relying only on percentage language');
      }
      requestedFormatUsed = hasFrequency;
      break;
    }
    case 'verify_understanding': {
      primaryOperationCompleted = ACK_PATTERN.test(reply) || /\b(understood|understanding|you('?ve| have) got)\b/i.test(reply);
      if (!primaryOperationCompleted) missingElements.push('acknowledgment of correct understanding');
      if (GENERIC_RISK_ONLY_PATTERN.test(reply) && wordCount(reply) > 40) {
        genericSubstitutionDetected = true;
        mustNotRepeat.push('full prior risk explanation');
        primaryOperationCompleted = false;
      }
      requestedFormatUsed = !GENERIC_RISK_ONLY_PATTERN.test(reply) || wordCount(reply) <= 45;
      break;
    }
    case 'compare': {
      primaryOperationCompleted = COMPARE_BOTH.test(reply);
      if (!primaryOperationCompleted) {
        missingElements.push('definition of each concept', 'important difference');
      }
      if (interpretation.secondaryOperations.includes('summarize')) {
        secondaryOperationsCompleted = wordCount(reply) <= 130;
        if (!secondaryOperationsCompleted) missingElements.push('brief comparison length');
      }
      requestedFormatUsed =
        !interpretation.requestedOutputFormat ||
        (interpretation.requestedOutputFormat.includes('two short')
          ? (reply.match(/[.!?]/g) ?? []).length <= 4 && wordCount(reply) <= 90
          : true);
      break;
    }
    case 'list_information': {
      primaryOperationCompleted = INPUTS_PATTERN.test(reply);
      if (!primaryOperationCompleted) missingElements.push('calculator input factors');
      if (interpretation.secondaryOperations.includes('identify_limitation')) {
        secondaryOperationsCompleted = LIMITATION_PATTERN.test(reply);
        if (!secondaryOperationsCompleted) missingElements.push('limitation or missing factors');
      }
      break;
    }
    case 'explain': {
      if (interpretation.topic === 'calculator_limitations') {
        primaryOperationCompleted = LIMITATION_PATTERN.test(reply);
        if (!primaryOperationCompleted) missingElements.push('individual-prediction limitation');
        if (GENERIC_RISK_ONLY_PATTERN.test(reply) && !LIMITATION_PATTERN.test(reply)) {
          genericSubstitutionDetected = true;
        }
      } else if (interpretation.topic === 'risk_meaning') {
        primaryOperationCompleted =
          /\b(probability|does not mean|not a diagnosis|out of)\b/i.test(reply);
      }
      break;
    }
    case 'draft':
    case 'revise': {
      primaryOperationCompleted = DRAFT_BODY_PATTERN.test(reply) || /"[^"]{20,}"/.test(reply);
      if (!primaryOperationCompleted) missingElements.push('editable draft body');
      if (interpretation.secondaryOperations.includes('shorten') || /\bshort\b/i.test(interpretation.explicitRequest)) {
        // Heuristic: draft section should not be a long formal letter.
        const draftMatch = reply.match(/"([^"]+)"/);
        if (draftMatch && draftMatch[1].split(/\s+/).length > 70) {
          secondaryOperationsCompleted = false;
          missingElements.push('shorter draft length');
        }
      }
      if (
        interpretation.secondaryOperations.includes('change_tone') ||
        /\bless formal|not too formal|conversational/i.test(interpretation.explicitRequest)
      ) {
        if (/\bplease advise whether a discussion would be appropriate\b/i.test(reply) && /\bless formal|not too formal/.test(interpretation.explicitRequest)) {
          // Still acceptable if other informal cues exist.
          secondaryOperationsCompleted =
            /\bhi\b|\bthanks\b|\bhelp (me )?understand\b/i.test(reply) || secondaryOperationsCompleted;
        }
      }
      if (/\bremove the appointment\b/i.test(interpretation.explicitRequest) && /\bappointment\b/i.test(reply)) {
        primaryOperationCompleted = false;
        missingElements.push('remove appointment sentence');
      }
      if (
        /\bfamily history\b/i.test(interpretation.explicitRequest) &&
        !/\bfamily history\b/i.test(reply)
      ) {
        primaryOperationCompleted = false;
        missingElements.push('keep family-history question');
      }
      break;
    }
    case 'provide_options': {
      primaryOperationCompleted =
        /\b(portal|message|write|call|healthcare professional|next step)\b/i.test(reply);
      if (interpretation.secondaryOperations.includes('acknowledge') || interpretation.secondaryIntents.includes('express_emotion')) {
        secondaryOperationsCompleted = /\b(worry|worried|concern|understandable|anxious)\b/i.test(reply);
      }
      break;
    }
    case 'plan_action': {
      primaryOperationCompleted = wordCount(reply) >= 8;
      if (interpretation.requestedOutputFormat === 'one simple step') {
        requestedFormatUsed = !MULTI_LIST_PATTERN.test(reply);
        if (!requestedFormatUsed) {
          primaryOperationCompleted = false;
          missingElements.push('single step without a list');
        }
      }
      break;
    }
    case 'confirm_action':
    case 'close':
    case 'acknowledge':
      primaryOperationCompleted = wordCount(reply) >= 4;
      break;
    default:
      primaryOperationCompleted = wordCount(reply) >= 6;
  }

  const directAnswerProvided = wordCount(reply.split('?')[0] ?? '') >= 4;
  const explicitRequestAddressed = primaryOperationCompleted && !genericSubstitutionDetected;

  const valid =
    explicitRequestAddressed &&
    primaryOperationCompleted &&
    secondaryOperationsCompleted &&
    requestedFormatUsed &&
    directAnswerProvided &&
    !unsupportedMedicalClaimDetected &&
    !unnecessaryQuestionDetected;

  let reason: string | undefined;
  if (!valid) {
    if (genericSubstitutionDetected) reason = 'requested_operation_not_completed: generic substitution for specific operation';
    else if (!primaryOperationCompleted) reason = 'requested_operation_not_completed';
    else if (!secondaryOperationsCompleted) reason = 'secondary_operations_incomplete';
    else if (!requestedFormatUsed) reason = 'requested_format_not_used';
    else if (unnecessaryQuestionDetected) reason = 'unnecessary_question_detected';
    else if (unsupportedMedicalClaimDetected) reason = 'unsupported_medical_claim';
    else if (!directAnswerProvided) reason = 'direct_answer_missing';
  }

  return {
    explicitRequestAddressed,
    primaryOperationCompleted,
    secondaryOperationsCompleted,
    requestedFormatUsed,
    directAnswerProvided,
    genericSubstitutionDetected,
    unsupportedMedicalClaimDetected,
    unnecessaryQuestionDetected,
    valid,
    reason,
    missingElements,
    mustNotRepeat,
  };
}

export function buildOperationRepairInstruction(validation: OperationValidation, interpretation: RequestInterpretation): string {
  return JSON.stringify(
    {
      failure: validation.reason ?? 'requested_operation_not_completed',
      required_operation: interpretation.operation,
      explicit_request: interpretation.explicitRequest,
      missing_elements: validation.missingElements,
      must_not_repeat: validation.mustNotRepeat.length
        ? validation.mustNotRepeat
        : ['generic probability definition'],
    },
    null,
    2,
  );
}
