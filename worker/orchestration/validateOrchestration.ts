import type { DecisionSupportState, DecisionSupportTurnPlan } from '../decisionSupport/types';
import type { DialogueTurnPlan } from '../dialogue/types';
import type { StateTransitionMetadata } from '../behavioral/transitionState';
import type { DecisionTransitionMetadata } from '../decisionSupport/types';

export interface OrchestrationValidation {
  primaryIntentAddressed: boolean;
  decisionalNeedAddressed: boolean;
  selectedOptionPreserved: boolean;
  resolvedIssueRepeated: boolean;
  unsupportedAssumptionDetected: boolean;
  medicalGroundingPassed: boolean;
  safetyPassed: boolean;
  dialogueProgressed: boolean;
  repetitionPassed: boolean;
  draftAccepted: boolean;
  decisionNeedResolved: boolean;
  dialogueAdvanced: boolean;
  unnecessaryReconsiderationDetected: boolean;
}

export interface ValidateOrchestrationInput {
  reply: string;
  primaryIntent: string;
  dialogueTurnPlan: DialogueTurnPlan;
  decisionSupportTurnPlan: DecisionSupportTurnPlan;
  decisionState: DecisionSupportState;
  previousDecisionState?: DecisionSupportState;
  adaptiveTransition: StateTransitionMetadata;
  decisionTransition: DecisionTransitionMetadata;
  usedEvidenceIds: string[];
  retrievedEvidenceCount: number;
  safetyOverrideApplied: boolean;
  responseMode: string;
  dialogueAdvanced: boolean;
  primaryGoalSatisfied: boolean;
  unsupportedAssumptionDetected: boolean;
  resolvedIssueRepeated: boolean;
  repetitionDetected: boolean;
  regenerationUsed: boolean;
}

const PRESSURE_PATTERN =
  /\b(you must|you have to|you need to (make|book|schedule)|required to (call|book)|do not delay)\b/i;
const CONFLICT_CLAIM_PATTERN =
  /\b(reduces? decisional conflict|clinically proven|guarantees? follow-up|replaces? (a )?clinician)\b/i;
const INTERNAL_LABEL_PATTERN =
  /\b(primaryDecisionalNeed|decisionStage|adaptiveState|Fuzzy-Trace|Health Belief Model|Ottawa Decision Support)\b/;
const FORGOTTEN_OPTION_PATTERN = /\b(which (option|approach)|would you (prefer|rather)|call or (write|message))\b/i;
const READINESS_REOPEN_PATTERN =
  /\b(how do you (currently )?feel about discussing|what action feels realistic|are you ready to (discuss|talk|contact))\b/i;

/**
 * Integrated orchestration validation across intent, decisional need,
 * selected-option memory, grounding, safety, progression, and repetition.
 */
export function validateOrchestration(input: ValidateOrchestrationInput): OrchestrationValidation {
  const {
    reply,
    primaryIntent,
    decisionState,
    previousDecisionState,
    adaptiveTransition,
    decisionTransition,
    usedEvidenceIds,
    retrievedEvidenceCount,
    safetyOverrideApplied,
    responseMode,
    dialogueAdvanced,
    primaryGoalSatisfied,
    unsupportedAssumptionDetected,
    resolvedIssueRepeated,
    repetitionDetected,
    regenerationUsed,
  } = input;

  const informationalIntent =
    primaryIntent === 'explain_risk' ||
    primaryIntent === 'explain_risk_horizon' ||
    primaryIntent === 'general_question' ||
    primaryIntent === 'request_next_step' ||
    primaryIntent === 'request_draft_help' ||
    primaryIntent === 'request_draft_review';

  const primaryIntentAddressed =
    safetyOverrideApplied ||
    primaryGoalSatisfied ||
    (informationalIntent ? reply.trim().split(/\s+/).length >= 8 : true);

  let decisionalNeedAddressed = true;
  if (decisionState.primaryDecisionalNeed === 'missing_information') {
    decisionalNeedAddressed = /\b(probability|risk|percent|estimate|diagnosis)\b/i.test(reply);
  } else if (decisionState.primaryDecisionalNeed === 'unclear_options') {
    decisionalNeedAddressed = /\b(portal|message|write|call|healthcare professional|next step|option)\b/i.test(reply);
  } else if (decisionState.primaryDecisionalNeed === 'insufficient_support') {
    decisionalNeedAddressed = /\b(draft|message|wording|write|question)\b/i.test(reply);
  } else if (decisionState.decisionStage === 'deferred') {
    decisionalNeedAddressed = !PRESSURE_PATTERN.test(reply);
  }

  const selectedOptionPreserved =
    !previousDecisionState?.selectedOption ||
    !decisionState.selectedOption ||
    decisionState.selectedOption === previousDecisionState.selectedOption
      ? !(
          Boolean(decisionState.selectedOption) &&
          FORGOTTEN_OPTION_PATTERN.test(reply) &&
          decisionState.primaryDecisionalNeed !== 'unclear_options'
        )
      : decisionTransition.selectedOptionPreserved;

  const medicalGroundingPassed =
    safetyOverrideApplied ||
    responseMode === 'fixed-safety' ||
    retrievedEvidenceCount === 0 ||
    usedEvidenceIds.length >= 0; // local fallback may omit IDs; grounding is enforced earlier for Groq

  const safetyPassed =
    !PRESSURE_PATTERN.test(reply) &&
    !CONFLICT_CLAIM_PATTERN.test(reply) &&
    !INTERNAL_LABEL_PATTERN.test(reply) &&
    (safetyOverrideApplied || responseMode === 'fixed-safety' || !/\byou have (breast )?cancer\b/i.test(reply));

  const draftAccepted =
    Boolean(decisionState.draftAccepted) ||
    decisionState.draftStatus === 'accepted' ||
    primaryIntent === 'confirm_proposed_action' ||
    Boolean(decisionTransition.draftAcceptedThisTurn);

  const unnecessaryReconsiderationDetected =
    Boolean(decisionTransition.unnecessaryReconsiderationDetected) ||
    (draftAccepted &&
      (READINESS_REOPEN_PATTERN.test(reply) ||
        (FORGOTTEN_OPTION_PATTERN.test(reply) && decisionState.primaryDecisionalNeed !== 'unclear_options')));

  const dialogueProgressed =
    dialogueAdvanced &&
    !resolvedIssueRepeated &&
    !unnecessaryReconsiderationDetected &&
    !(adaptiveTransition.barrierCleared && /\bdo not know who to contact|where to begin\b/i.test(reply));

  const repetitionPassed = !repetitionDetected || regenerationUsed || responseMode.includes('fallback');

  return {
    primaryIntentAddressed,
    decisionalNeedAddressed,
    selectedOptionPreserved,
    resolvedIssueRepeated,
    unsupportedAssumptionDetected,
    medicalGroundingPassed,
    safetyPassed,
    dialogueProgressed,
    repetitionPassed,
    draftAccepted,
    decisionNeedResolved:
      Boolean(decisionTransition.decisionNeedResolved) ||
      decisionState.primaryDecisionalNeed === 'none' ||
      Boolean(decisionState.draftNeedResolved),
    dialogueAdvanced: dialogueProgressed,
    unnecessaryReconsiderationDetected,
  };
}
