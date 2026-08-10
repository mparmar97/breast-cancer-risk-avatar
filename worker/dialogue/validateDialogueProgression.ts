import type { Barrier } from '../behavioral/state';
import type { StateTransitionMetadata } from '../behavioral/transitionState';
import type { DecisionSupportState, DecisionTransitionMetadata } from '../decisionSupport/types';
import type { ConversationMemory } from './conversationMemory';
import type { DialogueTurnPlan } from './types';

const BARRIER_REFERENCE_PATTERNS: Partial<Record<Barrier, RegExp>> = {
  access: /\b(who to contact|where to (begin|start)|don'?t know where)\b/i,
  time: /\b(while (you'?re|you are) working|during (your )?(work|shift)|no time|too busy)\b/i,
  cost: /\b(afford|cost|expensive|insurance|out of pocket)\b/i,
  fear: /\bfear is making\b|\bafraid to (call|message|contact)\b/i,
  mistrust: /\b(trust the (calculator|result)|skeptical)\b/i,
  uncertainty: /\buncertainty is making\b/i,
  delay: /\bkeeps? getting put off\b|\bkeep(s)? putting it off\b/i,
  other: /\bmain obstacle\b/i,
};

const ASSUMED_COMPLETED_ACTION_PATTERN =
  /\byou(?:'ve| have) (already )?(scheduled|booked|sent|called|messaged|contacted)\b/i;
const ASSUMED_RELATIONSHIP_PATTERN = /\byour (doctor|clinician|physician|oncologist) (already |will )/i;
const ASSUMED_APPOINTMENT_REQUIRED_PATTERN =
  /\b(you (need|must|have to) (make|book|schedule) an appointment|an appointment is required)\b/i;

const REPEATED_EXPLANATION_PATTERNS: RegExp[] = [
  /\brisk estimate describes probability\b/i,
  /\bdoes not mean that you currently have (breast )?cancer\b/i,
  /\bprobability,? not a diagnosis\b/i,
  /\bin a group of 100 (people|women)\b/i,
  /\bout of 100\b.*\b(might|may) develop\b/i,
  /\bin your own words,? what (do you think )?(the percentage|it) means\b/i,
];

const COMPREHENSION_FOLLOWUP_PATTERN =
  /\b(does that (help|clarif|make sense)|is (that|the) .* clearer|would you like .+ in your own words)\b/i;

const READINESS_REOPEN_PATTERN =
  /\b(how do you (currently )?feel about discussing|what action feels realistic|are you ready to (discuss|talk|contact))\b/i;

const FORGOTTEN_OPTION_PATTERN =
  /\b(which (option|approach)|would you (prefer|rather)|call or (write|message)|what (communication )?method)\b/i;

const TIMING_REASK_PATTERN =
  /\b(when (would|will|do) you (like to|want to|plan to) (send|act|do)|when would you like to send)\b/i;

const DRAFT_ACCEPTED_ACK_PATTERN =
  /\b(draft is ready|ready to use|accepted|usable|you can send|next step is clear|plan is clear|tonight)\b/i;

const ACTION_ACK_PATTERN =
  /\b(tonight|today|tomorrow|after work|you (can|may) send|plan (is|looks)|sounds like a clear next step|that plan)\b/i;

const ANSWER_GOALS = new Set(['answer_question', 'correct_misunderstanding']);

function countQuestions(text: string): number {
  const withoutQuoted = text.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ');
  return (withoutQuoted.match(/\?/g) ?? []).length;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export interface ValidateDialogueProgressionInput {
  reply: string;
  latestMessage: string;
  plan: DialogueTurnPlan;
  transitionMetadata: StateTransitionMetadata;
  previousAssistantReply?: string;
  decisionState?: DecisionSupportState;
  decisionTransition?: DecisionTransitionMetadata;
  primaryIntent?: string;
  conversationMemory?: ConversationMemory;
  previousDialogueAct?: string;
}

export interface DialogueProgressionResult {
  valid: boolean;
  dialogueAdvanced: boolean;
  selectedOptionPreserved: boolean;
  resolvedIssuesPreserved: boolean;
  primaryGoalSatisfied: boolean;
  unnecessaryReconsiderationDetected: boolean;
  repeatedDialogueMoveDetected: boolean;
  unsupportedAssumptionDetected: boolean;
  resolvedIssueRepeated: boolean;
  directQuestionAnswered: boolean;
  practicalRequestFulfilled: boolean;
  repeatedExplanationDetected: boolean;
  userCorrectionHandled: boolean;
  draftAccepted: boolean;
  decisionNeedResolved: boolean;
  reason?: string;
}

/**
 * Deterministically validates a generated reply against the dialogue-turn plan
 * and conversation memory.
 */
export function validateDialogueProgression(
  input: ValidateDialogueProgressionInput,
): DialogueProgressionResult {
  const { reply, plan, transitionMetadata, decisionState, decisionTransition, primaryIntent, conversationMemory } =
    input;

  const draftAccepted =
    Boolean(decisionState?.draftAccepted) ||
    decisionState?.draftStatus === 'accepted' ||
    conversationMemory?.draftStatus === 'accepted' ||
    primaryIntent === 'confirm_proposed_action' ||
    Boolean(decisionTransition?.draftAcceptedThisTurn);

  const selectedOption =
    conversationMemory?.selectedCommunicationOption ?? decisionState?.selectedOption ?? plan.selectedOption;

  const selectedOptionPreserved =
    !selectedOption ||
    !(FORGOTTEN_OPTION_PATTERN.test(reply) && plan.primaryGoal !== 'provide_practical_help');

  const timingKnown = Boolean(conversationMemory?.plannedTiming || decisionState?.actionTiming);

  const resolvedIssueRepeated = Boolean(
    (transitionMetadata.barrierCleared &&
      BARRIER_REFERENCE_PATTERNS[transitionMetadata.previousBarrier] &&
      (BARRIER_REFERENCE_PATTERNS[transitionMetadata.previousBarrier] as RegExp).test(reply)) ||
      (conversationMemory?.resolvedIssues.some((issue) => {
        if (issue.startsWith('barrier:')) {
          const barrier = issue.slice('barrier:'.length) as Barrier;
          return BARRIER_REFERENCE_PATTERNS[barrier]?.test(reply) ?? false;
        }
        return false;
      }) ??
        false),
  );

  const unsupportedAssumptionDetected =
    (ASSUMED_COMPLETED_ACTION_PATTERN.test(reply) &&
      !ASSUMED_COMPLETED_ACTION_PATTERN.test(input.latestMessage)) ||
    ASSUMED_RELATIONSHIP_PATTERN.test(reply) ||
    ASSUMED_APPOINTMENT_REQUIRED_PATTERN.test(reply);

  const directQuestionAnswered = ANSWER_GOALS.has(plan.primaryGoal)
    ? wordCount(reply.split('?')[0] ?? '') >= 6
    : true;

  let practicalRequestFulfilled = true;
  if (plan.primaryGoal === 'provide_practical_help') {
    const wantsDraft = plan.nextPendingItem?.type === 'proposed_draft';
    if (wantsDraft) {
      const hasEditableDraft =
        /\b(here is (a )?short editable draft|editable draft)\b/i.test(reply) ||
        /"Hello,[\s\S]{20,}"/i.test(reply) ||
        /\bwould like help interpreting\b/i.test(reply);
      practicalRequestFulfilled = hasEditableDraft && wordCount(reply) >= 20;
    } else {
      const hasNextStep =
        /\b(next step|healthcare professional|portal message|share the (demonstration )?estimate|written|clinic)\b/i.test(
          reply,
        ) &&
        wordCount(reply) >= 12 &&
        !/\bwhat action feels realistic\b/i.test(reply);
      practicalRequestFulfilled = hasNextStep;
    }
  } else if (plan.primaryGoal === 'review_user_draft') {
    const reviewsDraft =
      /\b(wording|draft|message)\b/i.test(reply) &&
      /\b(clear(?:ly)?|concise|appropriate|revise|as written|send it)\b/i.test(reply) &&
      !/\bwhat part of the result\b/i.test(reply) &&
      !/\bglad that is clearer\b/i.test(reply);
    practicalRequestFulfilled = reviewsDraft;
  } else if (plan.primaryGoal === 'confirm_progress' && draftAccepted && !timingKnown) {
    practicalRequestFulfilled = DRAFT_ACCEPTED_ACK_PATTERN.test(reply);
  } else if (plan.primaryGoal === 'confirm_progress' && timingKnown) {
    practicalRequestFulfilled = ACTION_ACK_PATTERN.test(reply) || DRAFT_ACCEPTED_ACK_PATTERN.test(reply);
  } else if (
    plan.primaryGoal === 'address_time_barrier' ||
    plan.primaryGoal === 'address_practical_barrier' ||
    plan.primaryGoal === 'understand_barrier'
  ) {
    practicalRequestFulfilled =
      /\b(time|schedule|work|call|calling|written|write|portal|message|busy|obstacle|manageable)\b/i.test(
        reply,
      ) &&
      !/\b\d+\s+out of\s+\d+\b/i.test(reply) &&
      !/\bin your own words\b/i.test(reply) &&
      !COMPREHENSION_FOLLOWUP_PATTERN.test(reply);
  }

  const tooManyQuestions = countQuestions(reply) > 1;
  const tooLong = wordCount(reply) > 90;

  const barrierGoalActive =
    plan.primaryGoal === 'address_time_barrier' ||
    plan.primaryGoal === 'address_practical_barrier' ||
    plan.primaryGoal === 'understand_barrier' ||
    plan.dialogueAct === 'explore_barrier';

  let repeatedExplanationDetected = false;
  if (
    plan.primaryGoal === 'confirm_understanding' ||
    plan.primaryGoal === 'confirm_progress' ||
    plan.primaryGoal === 'open_conversation' ||
    conversationMemory?.riskExplanationStatus === 'understood'
  ) {
    const explanationHits = REPEATED_EXPLANATION_PATTERNS.filter((pattern) => pattern.test(reply)).length;
    const asksComprehensionAgain = COMPREHENSION_FOLLOWUP_PATTERN.test(reply);
    const asksTeachBack = /\bin your own words\b/i.test(reply);
    // Allow risk explanation only when answering a fresh explain_risk question.
    // Barrier turns after understood risk must not be scored as "repeating risk."
    if (
      !barrierGoalActive &&
      plan.primaryGoal !== 'answer_question' &&
      plan.primaryGoal !== 'correct_misunderstanding'
    ) {
      repeatedExplanationDetected = explanationHits >= 1 || asksComprehensionAgain || asksTeachBack;
    } else if (barrierGoalActive) {
      repeatedExplanationDetected =
        /\b\d+\s+out of\s+\d+\b/i.test(reply) ||
        asksComprehensionAgain ||
        asksTeachBack ||
        explanationHits >= 2;
    }
  }

  const userCorrectionHandled =
    plan.primaryGoal === 'clarify_short_reply' && plan.dialogueAct === 'ask_clarification'
      ? countQuestions(reply) === 1 && !REPEATED_EXPLANATION_PATTERNS.some((pattern) => pattern.test(reply))
      : true;

  const unnecessaryReconsiderationDetected =
    (draftAccepted &&
      (READINESS_REOPEN_PATTERN.test(reply) ||
        (FORGOTTEN_OPTION_PATTERN.test(reply) && Boolean(selectedOption)))) ||
    (timingKnown && TIMING_REASK_PATTERN.test(reply) && primaryIntent === 'confirm_action') ||
    (Boolean(selectedOption) && FORGOTTEN_OPTION_PATTERN.test(reply) && draftAccepted);

  const repeatedDialogueMoveDetected =
    Boolean(input.previousDialogueAct) &&
    input.previousDialogueAct === plan.dialogueAct &&
    plan.dialogueAct !== 'fixed_safety' &&
    plan.dialogueAct !== 'close_conversation' &&
    Boolean(input.previousAssistantReply) &&
    REPEATED_EXPLANATION_PATTERNS.some((pattern) => pattern.test(reply)) &&
    REPEATED_EXPLANATION_PATTERNS.some((pattern) => pattern.test(input.previousAssistantReply ?? ''));

  const resolvedIssuesPreserved =
    !resolvedIssueRepeated &&
    !(conversationMemory?.riskExplanationStatus === 'understood' && repeatedExplanationDetected);

  const decisionNeedResolved =
    decisionTransition?.decisionNeedResolved ??
    (decisionState?.primaryDecisionalNeed === 'none' || Boolean(decisionState?.draftNeedResolved));

  const dialogueAdvanced =
    !resolvedIssueRepeated &&
    !unsupportedAssumptionDetected &&
    !repeatedExplanationDetected &&
    userCorrectionHandled &&
    !unnecessaryReconsiderationDetected &&
    !repeatedDialogueMoveDetected &&
    selectedOptionPreserved &&
    resolvedIssuesPreserved;

  const primaryGoalSatisfied =
    dialogueAdvanced && directQuestionAnswered && practicalRequestFulfilled && !tooManyQuestions && !tooLong;
  const valid = primaryGoalSatisfied;

  let reason: string | undefined;
  if (!valid) {
    if (unnecessaryReconsiderationDetected)
      reason = 'reply reopens readiness, option selection, timing, or draft review after resolution';
    else if (resolvedIssueRepeated) reason = 'reply returns to a resolved barrier or issue';
    else if (!selectedOptionPreserved) reason = 'reply forgets the already selected communication option';
    else if (repeatedDialogueMoveDetected) reason = 'reply repeats the previous dialogue move without justification';
    else if (unsupportedAssumptionDetected)
      reason = 'reply assumes an action, appointment, or relationship the user did not state';
    else if (repeatedExplanationDetected)
      reason = 'reply repeats the prior risk explanation or asks another comprehension/teach-back inappropriately';
    else if (!userCorrectionHandled) reason = 'reply does not handle the user correction with a targeted clarification';
    else if (!directQuestionAnswered)
      reason = 'reply does not appear to answer the direct question before asking a follow-up';
    else if (!practicalRequestFulfilled)
      reason = draftAccepted
        ? 'reply does not acknowledge draft acceptance or the confirmed plan'
        : 'reply does not provide the requested practical help or draft review';
    else if (tooManyQuestions) reason = 'reply asks more than one question';
    else if (tooLong) reason = 'reply exceeds 90 words';
  }

  return {
    valid,
    dialogueAdvanced,
    selectedOptionPreserved,
    resolvedIssuesPreserved,
    primaryGoalSatisfied,
    unnecessaryReconsiderationDetected,
    repeatedDialogueMoveDetected,
    unsupportedAssumptionDetected,
    resolvedIssueRepeated,
    directQuestionAnswered,
    practicalRequestFulfilled,
    repeatedExplanationDetected,
    userCorrectionHandled,
    draftAccepted,
    decisionNeedResolved,
    reason,
  };
}
