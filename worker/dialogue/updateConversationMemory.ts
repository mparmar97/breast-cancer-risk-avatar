import type { Intent } from '../behavioral/state';
import type { StateTransitionMetadata } from '../behavioral/transitionState';
import type { DecisionSupportState, DecisionTransitionMetadata } from '../decisionSupport/types';
import type { CurrentTurnInterpretation, DialogueTurnPlan, PendingConversationItem } from './types';
import type { ResolvedShortReply } from './resolveShortReply';
import {
  createDefaultConversationMemory,
  normalizeConversationMemory,
  type ConversationMemory,
  type ConversationDraftStatus,
} from './conversationMemory';
import { assertsUnderstandingUtterance } from './understandingSignals';

const TIMING_PATTERN =
  /\b(tonight|today|tomorrow|this evening|after work|this weekend|next week|later today)\b/i;

const WRITTEN_OPTION_PATTERN =
  /\b(writ(e|ing)|portal|message).{0,40}(clinic|schedule|better|prefer|works|fit|manageable)|fits my schedule\b/i;

const PHONE_OPTION_PATTERN = /\b(call|phone).{0,20}(better|prefer|works|clinic|doctor)\b/i;

const SEND_TONIGHT_PATTERN =
  /\bi('ll| will) send (it|this|that|the message|the draft).{0,20}(tonight|today|tomorrow|after work)?\b/i;

export interface UpdateConversationMemoryInput {
  latestMessage: string;
  interpretation: CurrentTurnInterpretation;
  primaryIntent: Intent;
  resolvedShortReply: ResolvedShortReply;
  adaptiveTransition: StateTransitionMetadata;
  decisionState: DecisionSupportState;
  decisionTransition: DecisionTransitionMetadata;
  previousMemory?: ConversationMemory | null;
  previousAssistantResponse?: string;
  /** After planning/generation — finalizes pending item and dialogue act. */
  dialogueTurnPlan?: DialogueTurnPlan;
  pendingItem?: PendingConversationItem;
}

function uniquePush(list: string[], item: string): string[] {
  if (list.includes(item)) return list;
  return [...list, item];
}

function mapDecisionDraftStatus(status: DecisionSupportState['draftStatus']): ConversationDraftStatus {
  switch (status) {
    case 'proposed':
      return 'proposed';
    case 'under_review':
      return 'proposed';
    case 'revision_requested':
      return 'revision_requested';
    case 'accepted':
      return 'accepted';
    case 'rejected':
      return 'rejected';
    default:
      return 'none';
  }
}

/**
 * Updates conversation memory from the current user turn and (optionally)
 * the finalized dialogue-turn plan for the assistant reply.
 */
export function updateConversationMemory(input: UpdateConversationMemoryInput): ConversationMemory {
  const previous = normalizeConversationMemory(input.previousMemory ?? createDefaultConversationMemory());
  const message = input.latestMessage;
  const intent = input.primaryIntent;
  const memory: ConversationMemory = {
    ...previous,
    understoodConcepts: [...previous.understoodConcepts],
    misunderstoodConcepts: [...previous.misunderstoodConcepts],
    answeredQuestions: [...previous.answeredQuestions],
    unresolvedQuestions: [...previous.unresolvedQuestions],
    selectedOptions: [...previous.selectedOptions],
    rejectedOptions: [...previous.rejectedOptions],
    draftConstraints: [...previous.draftConstraints],
    userPreferences: [...previous.userPreferences],
    resolvedBarriers: [...previous.resolvedBarriers],
    recentDialogueActs: [...previous.recentDialogueActs],
    rejectedCommunicationOptions: [...previous.rejectedCommunicationOptions],
    resolvedIssues: [...previous.resolvedIssues],
  };

  // Risk explanation status.
  if (intent === 'explain_risk' || intent === 'explain_risk_horizon' || intent === 'general_question') {
    memory.riskExplanationStatus =
      memory.riskExplanationStatus === 'understood' ? 'understood' : 'explained';
    memory.currentTopic = 'risk_meaning';
    memory.unresolvedNeed = 'confirm whether the risk explanation is clear';
    memory.unresolvedQuestions = uniquePush(memory.unresolvedQuestions, 'risk meaning');
  }

  const assertsUnderstandingInMessage = assertsUnderstandingUtterance(message);

  if (
    intent === 'confirm_understanding' ||
    assertsUnderstandingInMessage ||
    input.resolvedShortReply.overrideUnderstanding === 'correct' ||
    (input.adaptiveTransition.currentUnderstanding === 'correct' &&
      input.adaptiveTransition.understandingChanged)
  ) {
    memory.riskExplanationStatus = 'understood';
    memory.resolvedIssues = uniquePush(memory.resolvedIssues, 'risk_explanation');
    memory.resolvedIssues = uniquePush(memory.resolvedIssues, 'risk meaning');
    memory.resolvedIssues = uniquePush(memory.resolvedIssues, 'natural-frequency explanation');
    memory.understoodConcepts = uniquePush(
      memory.understoodConcepts,
      'approximate natural-frequency meaning',
    );
    memory.understoodConcepts = uniquePush(memory.understoodConcepts, 'five-year time horizon');
    memory.understoodConcepts = uniquePush(
      memory.understoodConcepts,
      'probability rather than certainty',
    );
    memory.understoodConcepts = uniquePush(memory.understoodConcepts, 'risk_explanation');
    memory.unresolvedQuestions = memory.unresolvedQuestions.filter((q) => q !== 'risk meaning');
    memory.answeredQuestions = uniquePush(memory.answeredQuestions, 'risk meaning');
    memory.unresolvedNeed = 'invite the next topic or next-step question';
  }

  // Latest practical barrier becomes the active need (outranks resolved risk).
  const barrierExpressedThisTurn =
    intent === 'describe_barrier' ||
    (input.adaptiveTransition.currentBarrier !== 'none' &&
      (input.adaptiveTransition.previousBarrier !== input.adaptiveTransition.currentBarrier ||
        /\b(call|calling|phone|busy|work schedule|during work|no time|who to contact|afford|trust|put(ting)? it off)\b/i.test(
          message,
        )));
  if (barrierExpressedThisTurn && input.adaptiveTransition.currentBarrier !== 'none') {
    const barrier = input.adaptiveTransition.currentBarrier;
    const callingDuringWork =
      /\b(call|calling|phone)\b/i.test(message) &&
      /\b(work|business hours|during the day|schedule)\b/i.test(message);
    memory.currentBarrier = barrier;
    memory.activeBarrier = barrier;
    memory.currentBarrierContext = callingDuringWork
      ? 'calling during work'
      : /\b(call|calling|phone)\b/i.test(message)
        ? 'calling'
        : barrier;
    memory.currentTopic = 'communication_support';
    memory.unresolvedNeed = callingDuringWork
      ? 'find a communication method compatible with work schedule'
      : `address the ${barrier} barrier with a manageable optional next step`;
    // Risk understanding stays resolved — do not reopen it.
    if (assertsUnderstandingInMessage) {
      memory.riskExplanationStatus = 'understood';
    }
  } else if (input.adaptiveTransition.barrierCleared) {
    if (memory.currentBarrier) {
      memory.resolvedBarriers = uniquePush(memory.resolvedBarriers, memory.currentBarrier);
    }
    memory.currentBarrier = undefined;
    memory.activeBarrier = undefined;
    memory.currentBarrierContext = undefined;
  }

  if (
    input.adaptiveTransition.currentUnderstanding === 'partial' ||
    input.adaptiveTransition.currentUnderstanding === 'incorrect'
  ) {
    memory.riskExplanationStatus = 'partially_understood';
    memory.misunderstoodConcepts = uniquePush(memory.misunderstoodConcepts, 'risk_explanation');
    memory.unresolvedNeed = 'clarify the misunderstood part of the risk result';
  }

  // Communication option selection.
  if (WRITTEN_OPTION_PATTERN.test(message) || /\bwriting to the clinic\b/i.test(message)) {
    memory.selectedCommunicationOption = 'written clinic message';
    memory.selectedOptions = uniquePush(memory.selectedOptions, 'written clinic message');
    memory.plannedAction = 'send a written clinic message';
    memory.unresolvedNeed = 'help drafting the clinic message if needed';
    memory.currentTopic = 'follow_up_communication';
  } else if (PHONE_OPTION_PATTERN.test(message)) {
    memory.selectedCommunicationOption = 'phone call';
    memory.selectedOptions = uniquePush(memory.selectedOptions, 'phone call');
    memory.plannedAction = 'call the clinic';
    memory.unresolvedNeed = 'make the phone follow-up specific';
    memory.currentTopic = 'follow_up_communication';
  } else if (input.decisionState.selectedOption) {
    const option = input.decisionState.selectedOption;
    if (/portal|written|message|draft/i.test(option)) {
      memory.selectedCommunicationOption =
        memory.selectedCommunicationOption ?? 'written clinic message';
    } else if (/phone|call/i.test(option)) {
      memory.selectedCommunicationOption = memory.selectedCommunicationOption ?? 'phone call';
    } else {
      memory.selectedCommunicationOption = memory.selectedCommunicationOption ?? option;
    }
    if (memory.selectedCommunicationOption) {
      memory.selectedOptions = uniquePush(memory.selectedOptions, memory.selectedCommunicationOption);
    }
  }

  if (input.decisionTransition.draftStatus === 'rejected' || input.decisionState.draftStatus === 'rejected') {
    if (memory.selectedCommunicationOption) {
      memory.rejectedCommunicationOptions = uniquePush(
        memory.rejectedCommunicationOptions,
        memory.selectedCommunicationOption,
      );
      memory.rejectedOptions = uniquePush(memory.rejectedOptions, memory.selectedCommunicationOption);
    }
    memory.selectedCommunicationOption = undefined;
    memory.draftStatus = 'rejected';
    memory.acceptedDraftText = undefined;
    memory.acceptedDraft = undefined;
    memory.unresolvedNeed = 'choose another optional follow-up approach if wanted';
  }

  // Draft lifecycle.
  if (intent === 'request_draft_help') {
    memory.draftStatus =
      memory.draftStatus === 'proposed' || memory.draftStatus === 'revision_requested'
        ? 'revision_requested'
        : 'requested';
    memory.unresolvedNeed = 'provide or revise an editable draft';
    memory.currentTopic = 'message_drafting';
  }

  if (intent === 'request_draft_review') {
    memory.draftStatus = memory.draftStatus === 'none' ? 'proposed' : memory.draftStatus;
    memory.unresolvedNeed = 'review whether the draft wording is clear';
  }

  if (intent === 'confirm_proposed_action' || input.decisionState.draftStatus === 'accepted') {
    memory.draftStatus = 'accepted';
    memory.acceptedDraftText =
      input.decisionState.acceptedDraftText ??
      input.pendingItem?.draftText ??
      memory.acceptedDraftText;
    memory.acceptedDraft = memory.acceptedDraftText;
    memory.selectedCommunicationOption =
      memory.selectedCommunicationOption ?? 'written clinic message';
    memory.plannedAction = memory.plannedAction ?? 'send the drafted clinic message';
    memory.resolvedIssues = uniquePush(memory.resolvedIssues, 'draft_wording');
    memory.unresolvedNeed = memory.plannedTiming
      ? 'summarize the selected plan or close supportively'
      : 'ask about timing or close supportively';
    memory.currentTopic = 'action_planning';
  }

  if (input.decisionState.draftStatus === 'revision_requested') {
    memory.draftStatus = 'revision_requested';
    memory.unresolvedNeed = 'revise the draft';
  } else if (
    input.decisionState.draftStatus === 'proposed' &&
    memory.draftStatus !== 'accepted'
  ) {
    memory.draftStatus = 'proposed';
  } else if (intent === 'request_draft_help' && memory.draftStatus === 'requested') {
    // stays requested until plan proposes draft
  } else if (memory.draftStatus === 'none') {
    memory.draftStatus = mapDecisionDraftStatus(input.decisionState.draftStatus);
  }

  // Timing / action commitment.
  const timingMatch = message.match(TIMING_PATTERN);
  if (
    intent === 'confirm_action' ||
    SEND_TONIGHT_PATTERN.test(message) ||
    (timingMatch && (memory.draftStatus === 'accepted' || Boolean(memory.selectedCommunicationOption)))
  ) {
    memory.plannedTiming = (timingMatch?.[0] ?? input.decisionState.actionTiming ?? 'tonight').toLowerCase();
    memory.plannedAction =
      memory.plannedAction ??
      (memory.draftStatus === 'accepted'
        ? 'send the drafted clinic message'
        : memory.selectedCommunicationOption
          ? `use ${memory.selectedCommunicationOption}`
          : 'take the next follow-up step');
    memory.actionStatus = 'confirmed';
    memory.resolvedIssues = uniquePush(memory.resolvedIssues, 'action_timing');
    memory.unresolvedNeed = 'acknowledge the specific plan or close supportively';
  } else if (
    /\b(save it|decide later|not (sending|send) it yet|keep(ing)? the draft|another day)\b/i.test(message)
  ) {
    memory.actionStatus = 'deferred';
    if (memory.draftStatus === 'proposed' || memory.draftStatus === 'accepted') {
      memory.draftStatus = 'saved';
    }
  } else if (input.decisionState.actionTiming) {
    memory.plannedTiming = input.decisionState.actionTiming;
    memory.actionStatus = memory.actionStatus === 'none' ? 'planned' : memory.actionStatus;
  }

  if (memory.currentTopic && !memory.activeTopic) {
    memory.activeTopic = memory.currentTopic;
  }

  // Next-step without option yet.
  if (intent === 'request_next_step' && !memory.selectedCommunicationOption) {
    memory.unresolvedNeed = 'provide neutral general follow-up options';
    memory.currentTopic = 'next_steps';
  }

  // Barrier resolution.
  if (input.adaptiveTransition.barrierCleared && input.adaptiveTransition.previousBarrier !== 'none') {
    memory.resolvedIssues = uniquePush(
      memory.resolvedIssues,
      `barrier:${input.adaptiveTransition.previousBarrier}`,
    );
  }

  // Closing.
  if (intent === 'conversation_closing') {
    memory.unresolvedNeed = undefined;
    memory.currentTopic = 'closing';
  }

  // Emotion must not remain the unresolved need after drafting/planning.
  if (
    memory.draftStatus === 'accepted' ||
    memory.draftStatus === 'proposed' ||
    memory.draftStatus === 'requested' ||
    memory.plannedTiming ||
    intent === 'request_draft_help' ||
    intent === 'request_next_step' ||
    intent === 'confirm_proposed_action' ||
    intent === 'confirm_action'
  ) {
    if (memory.unresolvedNeed?.includes('emotion') || memory.unresolvedNeed?.includes('worry')) {
      // replaced above by practical needs
    }
  }

  // Finalize from dialogue plan when available (end of turn).
  if (input.dialogueTurnPlan) {
    memory.lastAssistantDialogueAct = input.dialogueTurnPlan.dialogueAct;
    memory.pendingConversationItem = input.dialogueTurnPlan.nextPendingItem;
    if (
      input.dialogueTurnPlan.nextPendingItem?.type === 'proposed_draft' &&
      memory.draftStatus !== 'accepted'
    ) {
      memory.draftStatus =
        memory.draftStatus === 'revision_requested' ? 'revision_requested' : 'proposed';
      memory.acceptedDraftText =
        input.dialogueTurnPlan.nextPendingItem.draftText ?? memory.acceptedDraftText;
    }
    if (input.dialogueTurnPlan.unresolvedNeed) {
      // Keep user-turn unresolved need unless plan clears it via closing.
      if (input.dialogueTurnPlan.primaryGoal === 'close_supportively') {
        memory.unresolvedNeed = undefined;
      }
    }
  }

  return memory;
}
