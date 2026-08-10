/**
 * Validates response meaning against SemanticTurn + ResponsePlan.
 * Checks semantic properties, not exact wording (except intentional fixed safety).
 */

import type { NaturalFrequencyResult } from '../risk/convertRiskToNaturalFrequency';
import type { ResponsePlan } from './deriveResponsePlan';
import type { SemanticTurn } from './semanticTurn';
import type { ConversationMemory } from './conversationMemory';

export interface SemanticValidation {
  explicitRequestAddressed: boolean;
  primaryOperationCompleted: boolean;
  secondaryOperationsCompleted: boolean;
  requestedFormatUsed: boolean;
  directAnswerProvided: boolean;
  genericSubstitutionDetected: boolean;
  unsupportedMedicalClaimDetected: boolean;
  unnecessaryQuestionDetected: boolean;
  inventedEmotionOrBarrierDetected: boolean;
  resolvedTopicReopened: boolean;
  calculatorFactsPreserved: boolean;
  currentBarrierAddressed: boolean;
  resolvedRiskExplanationRepeated: boolean;
  currentTurnPriorityPreserved: boolean;
  unsupportedEmotionDetected: boolean;
  dialogueAdvanced: boolean;
  valid: boolean;
  reason?: string;
  missingElements: string[];
  mustNotRepeat: string[];
}

export interface ValidateResponseSemanticsInput {
  reply: string;
  semanticTurn: SemanticTurn;
  plan: ResponsePlan;
  calculation?: NaturalFrequencyResult | null;
  conversationMemory?: ConversationMemory;
}

const NATURAL_FREQUENCY_PATTERN = /\babout\s+\d+\s+out of\s+\d+\b|\b\d+\s+out of\s+\d+\b/i;
const FIVE_YEAR_PATTERN =
  /\b(five[- ]?years?|5[- ]?years?|over five years|during five years|over 5 years)\b/i;
const LIFETIME_PATTERN = /\blifetime\b/i;
const COMPARE_BOTH =
  /\bfive[- ]?year\b[\s\S]{0,200}\blifetime\b|\blifetime\b[\s\S]{0,200}\bfive[- ]?year\b/i;
const GENERIC_ONLY =
  /\brisk estimate (is|describes) (a )?probability\b/i;
const LIMITATION_PATTERN =
  /\b(cannot predict|can'?t predict|cannot tell|population|individual|not (a )?diagnosis|uncertainty|does not mean|not certainty|not a forecast|personal prediction|group-level|group level)\b/i;
const INPUTS_PATTERN =
  /\b(age|family history|biopsy|race|ethnicity|input|factor|information used)\b/i;
const ACK_PATTERN =
  /\b(that('?s| is) (right|correct|a clear|accurate)|you('?ve| have) (got|understood)|yes[,.]|correct|makes sense|clear understanding|clear way)\b/i;
const DRAFT_BODY_PATTERN = /\b(here is|editable draft|hello[,:]?|hi[,:])\b/i;
const MULTI_LIST_PATTERN = /(^|\n)\s*[-*•]\s+|\b(1\.|2\.|3\.)\s+/;
const DIAGNOSIS_CLAIM = /\byou have (breast )?cancer\b/i;
const INVENTED_FEAR = /\b(terrified|panic|you (must be|are) (scared|afraid))\b/i;

function countQuestions(text: string): number {
  const withoutQuoted = text.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ');
  return (withoutQuoted.match(/\?/g) ?? []).length;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function validateResponseSemantics(
  input: ValidateResponseSemanticsInput,
): SemanticValidation {
  const { reply, semanticTurn: turn, plan, calculation } = input;
  const missingElements: string[] = [];
  const mustNotRepeat: string[] = [];
  let primaryOperationCompleted = true;
  let secondaryOperationsCompleted = true;
  let requestedFormatUsed = true;
  let genericSubstitutionDetected = false;
  let unnecessaryQuestionDetected = false;
  let inventedEmotionOrBarrierDetected = false;
  let resolvedTopicReopened = false;
  let calculatorFactsPreserved = true;

  const unsupportedMedicalClaimDetected = DIAGNOSIS_CLAIM.test(reply);

  if (!plan.shouldAskQuestion) {
    if (
      /\bdoes that help\b/i.test(reply) ||
      /\bhow do you (currently )?feel\b/i.test(reply) ||
      /\bwhat action feels realistic\b/i.test(reply)
    ) {
      unnecessaryQuestionDetected = true;
    }
  }
  if (countQuestions(reply) > 1) unnecessaryQuestionDetected = true;

  if (turn.emotion === 'not_expressed' && INVENTED_FEAR.test(reply)) {
    inventedEmotionOrBarrierDetected = true;
  }
  if (
    turn.barrier === 'not_expressed' &&
    /\byour (main )?barrier is\b/i.test(reply) &&
    !/\b(if|whether)\b/i.test(reply)
  ) {
    inventedEmotionOrBarrierDetected = true;
  }

  const constraints = turn.constraints.length > 0 ? turn.constraints : turn.userConstraints;
  const barrierEvidence = turn.evidence?.barrier ?? turn.currentTurnEvidence.barrier;

  if (
    input.conversationMemory?.understoodConcepts.includes('risk_explanation') &&
    GENERIC_ONLY.test(reply) &&
    turn.primaryOperation === 'verify_understanding'
  ) {
    resolvedTopicReopened = true;
    mustNotRepeat.push('full prior risk explanation');
  }

  switch (turn.primaryOperation) {
    case 'convert': {
      const hasFrequency = NATURAL_FREQUENCY_PATTERN.test(reply);
      const expectsFiveYear =
        /five|5\s*year/i.test(turn.entities.timeHorizon ?? '') ||
        /five|5\s*year/i.test(calculation?.timeHorizon ?? '');
      if (!hasFrequency) {
        primaryOperationCompleted = false;
        missingElements.push('natural frequency');
      }
      if (expectsFiveYear && !FIVE_YEAR_PATTERN.test(reply)) {
        primaryOperationCompleted = false;
        missingElements.push('five-year horizon');
      }
      if (GENERIC_ONLY.test(reply) && !hasFrequency) {
        genericSubstitutionDetected = true;
        primaryOperationCompleted = false;
        mustNotRepeat.push('generic probability definition');
      }
      requestedFormatUsed = hasFrequency;
      break;
    }
    case 'verify_understanding': {
      primaryOperationCompleted =
        ACK_PATTERN.test(reply) || /\b(understood|understanding|you('?ve| have) got)\b/i.test(reply);
      if (!primaryOperationCompleted) missingElements.push('acknowledgment of correct understanding');
      if (GENERIC_ONLY.test(reply) && wordCount(reply) > 40) {
        genericSubstitutionDetected = true;
        primaryOperationCompleted = false;
        mustNotRepeat.push('full prior risk explanation');
      }
      break;
    }
    case 'correct_misunderstanding':
    case 'explain':
    case 'simplify':
    case 'elaborate': {
      if (
        (turn.topic === 'risk_meaning' || turn.topic === 'risk_level') &&
        turn.primaryOperation === 'correct_misunderstanding'
      ) {
        primaryOperationCompleted = LIMITATION_PATTERN.test(reply);
        if (!primaryOperationCompleted) {
          missingElements.push('probability versus individual prediction correction');
        }
        if (GENERIC_ONLY.test(reply) && !LIMITATION_PATTERN.test(reply)) {
          genericSubstitutionDetected = true;
        }
      } else if (turn.topic === 'calculator_limitations') {
        primaryOperationCompleted = LIMITATION_PATTERN.test(reply);
        if (!primaryOperationCompleted) missingElements.push('individual-prediction limitation');
      } else if (turn.topic === 'risk_meaning' || turn.topic === 'risk_level') {
        primaryOperationCompleted =
          /\b(probability|does not mean|not a diagnosis|out of)\b/i.test(reply);
      }
      break;
    }
    case 'compare': {
      primaryOperationCompleted = COMPARE_BOTH.test(reply) && LIFETIME_PATTERN.test(reply);
      if (!primaryOperationCompleted) {
        missingElements.push('definition of each concept', 'important difference');
      }
      if (turn.secondaryOperations.includes('summarize') || constraints.some((c) => /two short|brief/.test(c))) {
        secondaryOperationsCompleted = wordCount(reply) <= 130;
        if (!secondaryOperationsCompleted) missingElements.push('brief comparison length');
      }
      break;
    }
    case 'list_information':
    case 'answer_factual_question':
    case 'identify_limitation': {
      if (turn.topic === 'calculator_inputs') {
        primaryOperationCompleted = INPUTS_PATTERN.test(reply);
        if (!primaryOperationCompleted) missingElements.push('calculator input factors');
        if (turn.secondaryOperations.includes('identify_limitation')) {
          secondaryOperationsCompleted = LIMITATION_PATTERN.test(reply);
          if (!secondaryOperationsCompleted) missingElements.push('limitation or missing factors');
        }
      } else if (turn.primaryOperation === 'identify_limitation') {
        primaryOperationCompleted = LIMITATION_PATTERN.test(reply);
        if (!primaryOperationCompleted) missingElements.push('individual-prediction limitation');
      }
      break;
    }
    case 'draft':
    case 'revise': {
      primaryOperationCompleted = DRAFT_BODY_PATTERN.test(reply) || /"[^"]{20,}"/.test(reply);
      if (!primaryOperationCompleted) missingElements.push('editable draft body');
      if (constraints.some((c) => /appointment/.test(c)) && /\bappointment\b/i.test(reply)) {
        primaryOperationCompleted = false;
        missingElements.push('remove appointment sentence');
      }
      if (
        constraints.some((c) => /family-history|family history/.test(c)) &&
        !/\bfamily history\b/i.test(reply)
      ) {
        primaryOperationCompleted = false;
        missingElements.push('keep family-history question');
      }
      break;
    }
    case 'address_barrier': {
      const barrierWords =
        turn.barrier === 'time'
          ? /\b(time|schedule|work|calling|call|busy|written|write|portal|message)\b/i
          : turn.barrier === 'access'
            ? /\b(contact|begin|start|portal|primary-care|primary care|who to|where to|office)\b/i
            : turn.barrier === 'cost'
              ? /\b(cost|afford|expensive|insurance|coverage|payment)\b/i
              : turn.barrier === 'delay'
                ? /\b(put(ting)? it off|delay|follow through|manageable|actually do)\b/i
                : /\b(barrier|obstacle|difficult|manageable|next step)\b/i;
      const addressesCalling =
        !/call|work/i.test(barrierEvidence) ||
        /\b(call|calling|work|schedule|written|write|portal|message|time)\b/i.test(reply);
      primaryOperationCompleted = barrierWords.test(reply) && addressesCalling && wordCount(reply) >= 8;
      if (!primaryOperationCompleted) {
        missingElements.push('acknowledge practical barrier and offer a manageable alternative');
      }
      if (
        NATURAL_FREQUENCY_PATTERN.test(reply) ||
        (GENERIC_ONLY.test(reply) && /\b(probability|percent|out of)\b/i.test(reply))
      ) {
        resolvedTopicReopened = true;
        primaryOperationCompleted = false;
        mustNotRepeat.push('resolved risk explanation');
      }
      if (/\bdoes that help clarify what the number\b/i.test(reply) || /\bwhat does .{0,20}mean\b/i.test(reply)) {
        resolvedTopicReopened = true;
        primaryOperationCompleted = false;
      }
      break;
    }
    case 'plan':
    case 'clarify_preference': {
      if (constraints.includes('one simple step')) {
        requestedFormatUsed = !MULTI_LIST_PATTERN.test(reply);
        primaryOperationCompleted = wordCount(reply) >= 8 && requestedFormatUsed;
        if (!requestedFormatUsed) missingElements.push('single step without a list');
      } else {
        primaryOperationCompleted =
          /\b(portal|message|write|call|healthcare professional|next step)\b/i.test(reply);
      }
      if (turn.emotion !== 'not_expressed') {
        secondaryOperationsCompleted =
          /\b(worry|worried|concern|understandable|anxious|fear)\b/i.test(reply);
      }
      break;
    }
    case 'confirm':
    case 'defer':
    case 'close':
    case 'set_boundary':
    case 'request_clarification':
      primaryOperationCompleted = wordCount(reply) >= 4;
      break;
    default:
      primaryOperationCompleted = wordCount(reply) >= 6;
  }

  if (plan.directAnswerRequired && wordCount(reply.split('?')[0] ?? '') < 4) {
    primaryOperationCompleted = false;
    missingElements.push('direct answer');
  }

  const directAnswerProvided = wordCount(reply.split('?')[0] ?? '') >= 4;
  const explicitRequestAddressed = primaryOperationCompleted && !genericSubstitutionDetected;

  const isBarrierTurn =
    turn.primaryOperation === 'address_barrier' ||
    (turn.barrier !== 'not_expressed' && turn.barrier !== 'none');
  const currentBarrierAddressed =
    !isBarrierTurn ||
    (primaryOperationCompleted &&
      !NATURAL_FREQUENCY_PATTERN.test(reply) &&
      /\b(time|schedule|work|call|calling|written|write|portal|message|busy|obstacle|barrier|manageable)\b/i.test(
        reply,
      ));
  const resolvedRiskExplanationRepeated =
    resolvedTopicReopened ||
    (isBarrierTurn &&
      turn.understanding === 'correct' &&
      (NATURAL_FREQUENCY_PATTERN.test(reply) ||
        /\bdoes that help clarify what the number\b/i.test(reply) ||
        (GENERIC_ONLY.test(reply) && /\bout of\b/i.test(reply))));
  const unsupportedEmotionDetected =
    inventedEmotionOrBarrierDetected ||
    (turn.emotion === 'not_expressed' && INVENTED_FEAR.test(reply));
  const currentTurnPriorityPreserved =
    !resolvedRiskExplanationRepeated && (!isBarrierTurn || currentBarrierAddressed);
  const dialogueAdvanced =
    currentTurnPriorityPreserved &&
    primaryOperationCompleted &&
    !resolvedRiskExplanationRepeated;

  const valid =
    explicitRequestAddressed &&
    primaryOperationCompleted &&
    secondaryOperationsCompleted &&
    requestedFormatUsed &&
    directAnswerProvided &&
    !unsupportedMedicalClaimDetected &&
    !unnecessaryQuestionDetected &&
    !inventedEmotionOrBarrierDetected &&
    !resolvedTopicReopened &&
    !resolvedRiskExplanationRepeated &&
    currentTurnPriorityPreserved &&
    calculatorFactsPreserved;

  let reason: string | undefined;
  if (!valid) {
    if (resolvedRiskExplanationRepeated) {
      reason = 'resolved_risk_explanation_repeated';
    } else if (genericSubstitutionDetected) {
      reason = 'requested_operation_not_completed: generic substitution for specific operation';
    } else if (!primaryOperationCompleted) reason = 'requested_operation_not_completed';
    else if (!secondaryOperationsCompleted) reason = 'secondary_operations_incomplete';
    else if (!requestedFormatUsed) reason = 'requested_format_not_used';
    else if (unnecessaryQuestionDetected) reason = 'unnecessary_question_detected';
    else if (unsupportedMedicalClaimDetected) reason = 'unsupported_medical_claim';
    else if (inventedEmotionOrBarrierDetected) reason = 'invented_emotion_or_barrier';
    else if (resolvedTopicReopened) reason = 'resolved_topic_reopened';
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
    inventedEmotionOrBarrierDetected,
    resolvedTopicReopened,
    calculatorFactsPreserved,
    currentBarrierAddressed,
    resolvedRiskExplanationRepeated,
    currentTurnPriorityPreserved,
    unsupportedEmotionDetected,
    dialogueAdvanced,
    valid,
    reason,
    missingElements,
    mustNotRepeat,
  };
}

export function buildSemanticRepairInstruction(
  validation: Pick<SemanticValidation, 'reason' | 'missingElements' | 'mustNotRepeat'> | OperationLike,
  turn: SemanticTurn,
): string {
  return JSON.stringify(
    {
      failure: validation.reason ?? 'requested_operation_not_completed',
      required_operation: turn.primaryOperation,
      explicit_request: turn.explicitRequest,
      missing_elements: validation.missingElements,
      must_not_repeat: validation.mustNotRepeat.length
        ? validation.mustNotRepeat
        : ['generic probability definition'],
    },
    null,
    2,
  );
}

interface OperationLike {
  reason?: string;
  missingElements: string[];
  mustNotRepeat: string[];
}
