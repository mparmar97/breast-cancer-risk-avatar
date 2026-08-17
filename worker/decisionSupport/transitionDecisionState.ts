import type { Intent } from '../behavioral/state';
import type { AdaptiveState } from '../behavioral/state';
import { isClosingUtterance } from '../dialogue/closingSignals';
import type { CurrentTurnInterpretation } from '../dialogue/types';
import type { ResolvedShortReply } from '../dialogue/resolveShortReply';
import {
  createDefaultDecisionSupportState,
  type DecisionConfidence,
  type DecisionalNeed,
  type DecisionStage,
  type DecisionSupportState,
  type DecisionTopic,
  type DecisionTransitionMetadata,
  type DraftStatus,
} from './types';
import type { PendingConversationItem } from '../dialogue/types';

const NEXT_STEP_PATTERN =
  /\b(what (should|can|do) i do next|what next|next step|unsure what to do|do not know what to do|don't know what to do|dont know what to do)\b/i;

const OPTION_CHOICE_PATTERN =
  /\b(portal message|patient portal|write( to)?( the)? clinic|writing (to the clinic|a message)|call(ing)? (the )?(clinic|doctor|office)|phone call|after work|tonight|this evening)\b/i;

const PORTAL_PREFERENCE_PATTERN =
  /\b(portal|writ(e|ing)|message).{0,40}(better|prefer|works|fit|manageable)|fits my schedule\b/i;

const DEFER_PATTERN =
  /\b(not (today|now)|do not want to decide|don't want to decide|dont want to decide|later|another day|not ready to decide|need more time to (think|decide))\b/i;

const DRAFT_ACCEPT_PATTERN =
  /\b(that (draft|message|wording) sounds? clear|that looks good|the (message|draft|wording) is fine|i like that wording|i can use this|that works for me|i('ll| will) use that (message|draft)|looks good|yes,? that is clear|no changes (are )?needed|the wording is clear|sounds clear|clear as written)\b/i;

const DRAFT_REVISION_PATTERN =
  /\b((make|can you make) it shorter|that is close|too long|revise|reword|edit (it|the draft|the message)|change the wording|shorter version)\b/i;

const DRAFT_REJECT_PATTERN =
  /\b(i (do not|don't|dont) want to (send|use) (that|this|it)|i (won't|will not) send (that|this|it)|not going to send (that|this)|reject (that|the) (draft|message))\b/i;

const SEND_DRAFTED_MESSAGE_OPTION = 'send the drafted clinic message';

const TIMING_PATTERN =
  /\b(tonight|today|tomorrow|this evening|after work|this weekend|next week|later today)\b/i;

export interface TransitionDecisionStateInput {
  latestMessage: string;
  interpretation: CurrentTurnInterpretation;
  primaryIntent: Intent;
  secondaryIntents: Intent[];
  adaptiveState: AdaptiveState;
  previousDecisionState?: DecisionSupportState;
  resolvedShortReply: ResolvedShortReply;
  resolvedMeaning?: string;
  pendingItem?: PendingConversationItem;
}

function detectSelectedOption(message: string, previous: string | null): string | null {
  if (
    PORTAL_PREFERENCE_PATTERN.test(message) ||
    /\bportal message would work\b/i.test(message) ||
    (/\bportal\b/i.test(message) && /\b(script|message|draft|send)\b/i.test(message))
  ) {
    return 'portal message';
  }
  if (/\b(writing to the clinic|write to the clinic)\b/i.test(message)) {
    return 'portal message';
  }
  if (
    /\b(call|phone).{0,20}(better|prefer|works)\b/i.test(message) ||
    /\bcall(ing)? (the )?(clinic|doctor|office)\b/i.test(message) ||
    /\bphone call\b/i.test(message)
  ) {
    return 'phone call';
  }
  return previous;
}

function detectPreference(message: string): string | null {
  if (PORTAL_PREFERENCE_PATTERN.test(message) || /\bfits my schedule\b/i.test(message)) {
    return 'prefers asynchronous clinic contact that fits schedule';
  }
  if (/\bafter work\b/i.test(message)) {
    return 'prefers after-work timing';
  }
  return null;
}

function estimateNeed(
  primaryIntent: Intent,
  adaptiveState: AdaptiveState,
  previous: DecisionSupportState,
  message: string,
): { topic: DecisionTopic; need: DecisionalNeed; secondary: DecisionalNeed[]; stage: DecisionStage; confidence: DecisionConfidence } {
  if (primaryIntent === 'conversation_closing' || isClosingUtterance(message)) {
    return {
      topic: previous.decisionTopic === 'none' ? 'none' : previous.decisionTopic,
      need: 'resolved',
      secondary: [],
      stage: 'closed',
      confidence: previous.decisionConfidence === 'unknown' ? 'moderate' : previous.decisionConfidence,
    };
  }

  if (DEFER_PATTERN.test(message)) {
    return {
      topic: previous.decisionTopic === 'none' ? 'whether_to_follow_up' : previous.decisionTopic,
      need: 'none',
      secondary: adaptiveState.emotion === 'worried' || adaptiveState.emotion === 'overwhelmed' ? ['emotional_barrier'] : [],
      stage: 'deferred',
      confidence: 'unknown',
    };
  }

  if (
    primaryIntent === 'explain_risk' ||
    primaryIntent === 'explain_risk_horizon' ||
    primaryIntent === 'general_question'
  ) {
    return {
      topic: 'risk_interpretation',
      need: 'missing_information',
      secondary: [],
      stage: 'information_seeking',
      confidence: 'unknown',
    };
  }

  if (primaryIntent === 'confirm_understanding') {
    return {
      topic: previous.decisionTopic === 'risk_interpretation' ? 'risk_interpretation' : previous.decisionTopic,
      need: 'resolved',
      secondary: [],
      stage: previous.decisionStage === 'information_seeking' ? 'option_clarification' : previous.decisionStage,
      confidence: 'moderate',
    };
  }

  if (primaryIntent === 'request_draft_help' || primaryIntent === 'request_next_step' || NEXT_STEP_PATTERN.test(message)) {
    const secondary: DecisionalNeed[] = [];
    if (adaptiveState.emotion === 'worried' || adaptiveState.emotion === 'overwhelmed') {
      secondary.push('emotional_barrier');
    }
    if (adaptiveState.barrier !== 'none' && adaptiveState.barrier !== 'fear') {
      secondary.push('practical_barrier');
    }
    return {
      topic: primaryIntent === 'request_draft_help' ? 'message_drafting' : 'how_to_follow_up',
      need: primaryIntent === 'request_draft_help' ? 'insufficient_support' : 'unclear_options',
      secondary,
      stage: primaryIntent === 'request_draft_help' ? 'preparing_action' : 'option_clarification',
      confidence: adaptiveState.selfEfficacy === 'low' ? 'low' : 'unknown',
    };
  }

  if (
    primaryIntent === 'confirm_action' ||
    (TIMING_PATTERN.test(message) && previous.selectedOption) ||
    /\bi('ll| will) send (it|this|that|the message|the draft)\b/i.test(message)
  ) {
    return {
      topic: previous.decisionTopic === 'none' ? 'how_to_follow_up' : previous.decisionTopic,
      need: 'resolved',
      secondary: [],
      stage: 'action_confirmed',
      confidence: 'high',
    };
  }

  if (primaryIntent === 'confirm_proposed_action' || DRAFT_ACCEPT_PATTERN.test(message)) {
    return {
      topic: 'choose_timing',
      need: 'none',
      secondary: [],
      stage: 'planning_action',
      confidence: 'moderate',
    };
  }

  if (primaryIntent === 'request_draft_review') {
    return {
      topic: 'review_message_draft',
      need: 'low_confidence',
      secondary: [],
      stage: 'preparing_action',
      confidence: 'moderate',
    };
  }

  if (OPTION_CHOICE_PATTERN.test(message) || PORTAL_PREFERENCE_PATTERN.test(message)) {
    const optionNow = detectSelectedOption(message, previous.selectedOption);
    const hasOption = Boolean(optionNow) || PORTAL_PREFERENCE_PATTERN.test(message);
    return {
      topic: 'how_to_follow_up',
      need: hasOption ? 'insufficient_support' : 'unclear_preferences',
      secondary: [],
      stage: hasOption ? 'preparing_action' : 'preference_clarification',
      confidence: 'moderate',
    };
  }

  if (adaptiveState.barrier !== 'none') {
    return {
      topic: 'how_to_follow_up',
      need: 'practical_barrier',
      secondary: adaptiveState.emotion === 'worried' ? ['emotional_barrier'] : [],
      stage: 'option_clarification',
      confidence: 'low',
    };
  }

  if (primaryIntent === 'express_emotion') {
    return {
      topic: previous.decisionTopic === 'none' ? 'whether_to_follow_up' : previous.decisionTopic,
      need: 'emotional_barrier',
      secondary: [],
      stage: previous.decisionStage === 'not_started' ? 'information_seeking' : previous.decisionStage,
      confidence: 'low',
    };
  }

  if (primaryIntent === 'express_confidence') {
    return {
      topic: previous.decisionTopic === 'none' ? 'how_to_follow_up' : previous.decisionTopic,
      need: previous.selectedOption ? 'insufficient_support' : 'unclear_options',
      secondary: [],
      stage: 'preparing_action',
      confidence: 'moderate',
    };
  }

  if (primaryIntent === 'greeting' || primaryIntent === 'social_acknowledgment') {
    return {
      topic: 'none',
      need: 'none',
      secondary: [],
      stage: 'not_started',
      confidence: 'unknown',
    };
  }

  return {
    topic: previous.decisionTopic,
    need: previous.primaryDecisionalNeed === 'resolved' ? 'resolved' : previous.primaryDecisionalNeed,
    secondary: previous.secondaryDecisionalNeeds,
    stage: previous.decisionStage,
    confidence: previous.decisionConfidence,
  };
}

/**
 * Deterministically estimates and transitions temporary decisional-needs
 * state from the current turn — current evidence overrides carried state.
 */
export function transitionDecisionState(input: TransitionDecisionStateInput): {
  state: DecisionSupportState;
  metadata: DecisionTransitionMetadata;
} {
  const previous = input.previousDecisionState ?? createDefaultDecisionSupportState();
  const message = input.latestMessage;
  const estimate = estimateNeed(input.primaryIntent, input.adaptiveState, previous, message);
  const pendingDraft = input.pendingItem?.type === 'proposed_draft' ? input.pendingItem : undefined;

  let selectedOption = detectSelectedOption(message, previous.selectedOption);
  const preference = detectPreference(message);
  const expressedPreferences = preference
    ? Array.from(new Set([...previous.expressedPreferences, preference]))
    : previous.expressedPreferences;

  const timingMatch = message.match(TIMING_PATTERN);
  const actionTiming =
    estimate.stage === 'action_confirmed' && timingMatch
      ? timingMatch[0].toLowerCase()
      : previous.actionTiming;

  const acceptingDraft =
    input.primaryIntent === 'confirm_proposed_action' ||
    (Boolean(pendingDraft) && DRAFT_ACCEPT_PATTERN.test(message)) ||
    DRAFT_ACCEPT_PATTERN.test(message);
  const revisingDraft =
    Boolean(pendingDraft) &&
    (DRAFT_REVISION_PATTERN.test(message) ||
      (input.primaryIntent === 'request_draft_help' && previous.draftStatus === 'proposed'));
  const rejectingDraft = Boolean(pendingDraft) && DRAFT_REJECT_PATTERN.test(message);

  let draftStatus: DraftStatus = previous.draftStatus;
  let draftAccepted = previous.draftAccepted;
  let acceptedDraftText = previous.acceptedDraftText;
  let acceptedDraftPurpose = previous.acceptedDraftPurpose;
  let draftNeedResolved = previous.draftNeedResolved;

  if (input.primaryIntent === 'request_draft_help' && !acceptingDraft) {
    draftStatus = revisingDraft || previous.draftStatus === 'proposed' ? 'revision_requested' : 'proposed';
    draftAccepted = false;
    draftNeedResolved = false;
  } else if (input.primaryIntent === 'request_draft_review' && !acceptingDraft) {
    draftStatus = 'under_review';
  } else if (rejectingDraft) {
    draftStatus = 'rejected';
    draftAccepted = false;
    draftNeedResolved = true;
    selectedOption = null;
    acceptedDraftText = null;
    acceptedDraftPurpose = null;
  } else if (revisingDraft) {
    draftStatus = 'revision_requested';
    draftAccepted = false;
    draftNeedResolved = false;
  } else if (acceptingDraft) {
    draftStatus = 'accepted';
    draftAccepted = true;
    draftNeedResolved = true;
    selectedOption = SEND_DRAFTED_MESSAGE_OPTION;
    acceptedDraftText = pendingDraft?.draftText ?? previous.acceptedDraftText;
    acceptedDraftPurpose = pendingDraft?.draftPurpose ?? previous.acceptedDraftPurpose;
  }

  const informationNeedResolved =
    previous.informationNeedResolved ||
    input.primaryIntent === 'confirm_understanding' ||
    (input.adaptiveState.understanding === 'correct' &&
      (input.primaryIntent === 'request_next_step' || NEXT_STEP_PATTERN.test(message)));

  // Preserve selected option across unrelated turns unless rejected or replaced.
  const preservedOption = selectedOption ?? previous.selectedOption;

  let primaryNeed = estimate.need;
  let topic = estimate.topic;
  let stage = estimate.stage;
  if (
    informationNeedResolved &&
    primaryNeed === 'missing_information' &&
    (input.primaryIntent === 'request_next_step' || NEXT_STEP_PATTERN.test(message))
  ) {
    primaryNeed = 'unclear_options';
    topic = 'how_to_follow_up';
    stage = 'option_clarification';
  }

  if (preservedOption && input.primaryIntent === 'request_draft_help' && !acceptingDraft) {
    primaryNeed = 'insufficient_support';
    topic = 'message_drafting';
    stage = 'preparing_action';
  }

  if (acceptingDraft) {
    primaryNeed = 'none';
    topic = previous.actionTiming || actionTiming ? 'prepare_questions' : 'choose_timing';
    stage = previous.selectedOption || selectedOption === SEND_DRAFTED_MESSAGE_OPTION
      ? 'planning_action'
      : 'selected_option';
  } else if (rejectingDraft) {
    primaryNeed = 'unclear_options';
    topic = 'how_to_follow_up';
    stage = 'option_clarification';
  } else if (preservedOption && !acceptingDraft && primaryNeed === 'unclear_preferences') {
    stage = 'selected_option';
  }

  const state: DecisionSupportState = {
    decisionTopic: topic,
    decisionStage: stage,
    primaryDecisionalNeed: primaryNeed,
    secondaryDecisionalNeeds: estimate.secondary,
    expressedPreferences,
    selectedOption: rejectingDraft ? null : preservedOption,
    unresolvedQuestion:
      acceptingDraft
        ? actionTiming
          ? null
          : 'when the user would like to send the accepted draft'
        : primaryNeed === 'unclear_options'
          ? 'which optional follow-up communication approach feels manageable'
          : primaryNeed === 'insufficient_support' && !draftAccepted
            ? 'how to word a clinic message'
            : null,
    decisionConfidence: estimate.confidence,
    draftAccepted,
    draftStatus,
    acceptedDraftText,
    acceptedDraftPurpose,
    draftNeedResolved,
    actionTiming,
    informationNeedResolved,
  };

  const changedFields: string[] = [];
  if (previous.primaryDecisionalNeed !== state.primaryDecisionalNeed) changedFields.push('primaryDecisionalNeed');
  if (previous.decisionStage !== state.decisionStage) changedFields.push('decisionStage');
  if (previous.decisionTopic !== state.decisionTopic) changedFields.push('decisionTopic');
  if (previous.selectedOption !== state.selectedOption) changedFields.push('selectedOption');
  if (previous.draftAccepted !== state.draftAccepted) changedFields.push('draftAccepted');
  if (previous.draftStatus !== state.draftStatus) changedFields.push('draftStatus');
  if (previous.actionTiming !== state.actionTiming) changedFields.push('actionTiming');
  if (previous.informationNeedResolved !== state.informationNeedResolved) changedFields.push('informationNeedResolved');

  const metadata: DecisionTransitionMetadata = {
    previousNeed: previous.primaryDecisionalNeed,
    currentNeed: state.primaryDecisionalNeed,
    previousStage: previous.decisionStage,
    currentStage: state.decisionStage,
    previousSelectedOption: previous.selectedOption,
    currentSelectedOption: state.selectedOption,
    selectedOptionPreserved: Boolean(
      (previous.selectedOption && state.selectedOption === previous.selectedOption) ||
        (acceptingDraft && state.selectedOption === SEND_DRAFTED_MESSAGE_OPTION),
    ),
    informationNeedResolvedThisTurn: !previous.informationNeedResolved && state.informationNeedResolved,
    decisionDeferredThisTurn: state.decisionStage === 'deferred' && previous.decisionStage !== 'deferred',
    actionConfirmedThisTurn: state.decisionStage === 'action_confirmed' && previous.decisionStage !== 'action_confirmed',
    draftAcceptedThisTurn: !previous.draftAccepted && state.draftAccepted,
    draftStatus: state.draftStatus,
    decisionNeedResolved: state.primaryDecisionalNeed === 'none' || state.draftNeedResolved,
    unnecessaryReconsiderationDetected: false,
    changedFields,
    stateChanged: changedFields.length > 0,
  };

  return { state, metadata };
}
