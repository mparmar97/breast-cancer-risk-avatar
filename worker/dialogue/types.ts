/**
 * Shared types for the general dynamic multi-turn dialogue manager
 * (see docs/GENERAL_DYNAMIC_DIALOGUE_MANAGER.md). These describe
 * conversational bookkeeping — what the assistant was trying to do last
 * turn, what it's waiting on, and what it plans to do this turn — layered
 * on top of the existing AdaptiveState/DialogueStrategy types.
 * None of this is a diagnosis; it is a lightweight heuristic used only to
 * keep multi-turn conversation coherent.
 */

import type { DialogueStrategy } from '../behavioral/policy';
import type {
  AdaptiveState,
  Barrier,
  Emotion,
  Intent,
  Readiness,
  SafetyFlag,
  SelfEfficacy,
  Understanding,
} from '../behavioral/state';
import type { RiskResult } from '../types';

/** Re-exported under the more descriptive name used by the dialogue-manager spec. */
export type { Intent as UserIntent } from '../behavioral/state';

/**
 * What the assistant's *previous* reply was actually doing, independent of
 * the theory-strategy that produced it — used so the next turn can tell,
 * e.g., "I just offered a single option" apart from "I just explored a
 * barrier in general".
 */
export type AssistantDialogueAct =
  | 'greet_user'
  | 'explain_information'
  | 'correct_misunderstanding'
  | 'reflect_emotion'
  | 'explore_barrier'
  | 'offer_option'
  | 'ask_clarification'
  | 'ask_understanding'
  | 'support_capability'
  | 'explore_ambivalence'
  | 'plan_action'
  | 'confirm_progress'
  | 'review_draft'
  | 'close_conversation'
  | 'fixed_safety'
  | 'none';

export const ASSISTANT_DIALOGUE_ACT_VALUES: readonly AssistantDialogueAct[] = [
  'greet_user',
  'explain_information',
  'correct_misunderstanding',
  'reflect_emotion',
  'explore_barrier',
  'offer_option',
  'ask_clarification',
  'ask_understanding',
  'support_capability',
  'explore_ambivalence',
  'plan_action',
  'confirm_progress',
  'review_draft',
  'close_conversation',
  'fixed_safety',
  'none',
];

export type PendingItemType =
  | 'question'
  | 'single_option'
  | 'multiple_options'
  | 'teach_back'
  | 'comprehension_check'
  | 'action_commitment'
  | 'proposed_draft'
  | 'none';

export type ExpectedReplyType =
  | 'affirmation'
  | 'negation'
  | 'explanation'
  | 'choice'
  | 'review_or_acceptance'
  | 'open_response'
  | 'none';

/**
 * A record of "what the assistant is waiting to hear back about" — the
 * question it just asked, the single option it just offered, or a draft it
 * proposed — so a short next-turn reply like "yes" can be resolved
 * contextually instead of left ambiguous.
 */
export interface PendingConversationItem {
  type: PendingItemType;
  text?: string;
  option?: string;
  draftText?: string;
  draftPurpose?: string;
  expectedReplyType?: ExpectedReplyType;
}

export const NO_PENDING_ITEM: PendingConversationItem = { type: 'none', expectedReplyType: 'none' };

export interface ConversationTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Everything the dialogue manager needs about the conversation so far,
 * assembled once per turn by worker/dialogue/buildConversationContext.ts.
 * Deliberately excludes API keys, raw environment variables, hidden
 * prompts, raw provider errors, full developer metadata, and any
 * chain-of-thought.
 */
export interface ConversationContext {
  latestMessage: string;
  recentMessages: ConversationTurnMessage[];
  previousAdaptiveState?: AdaptiveState;
  previousStrategy?: DialogueStrategy;
  previousAssistantDialogueAct?: AssistantDialogueAct;
  pendingItem?: PendingConversationItem;
  /** Up to the last 2-3 selected strategies, most-recent-last — used only for strategy-stagnation detection. */
  recentStrategies: DialogueStrategy[];
  /** Consecutive turns the previously-active barrier has gone unmentioned — used only for barrier expiry. */
  barrierUnmentionedTurns: number;
  recentAssistantResponses: string[];
  demonstrationRiskResult: RiskResult;
}

export type DialogueTurnPrimaryGoal =
  | 'open_conversation'
  | 'answer_question'
  | 'correct_misunderstanding'
  | 'acknowledge_emotion'
  | 'understand_barrier'
  | 'offer_manageable_option'
  | 'recognize_capability'
  | 'explore_ambivalence'
  | 'provide_practical_help'
  | 'make_action_specific'
  | 'confirm_understanding'
  | 'confirm_progress'
  | 'review_user_draft'
  | 'clarify_short_reply'
  | 'maintain_safety'
  | 'close_supportively';

export type DialogueQuestionPurpose =
  | 'invite_topic'
  | 'clarification'
  | 'teach_back'
  | 'comprehension'
  | 'explore_next_concern'
  | 'next_concern'
  | 'barrier_exploration'
  | 'confidence'
  | 'option'
  | 'action_planning'
  | 'readiness'
  | 'none';

/**
 * What the *next* response must accomplish, without writing the response
 * itself — the deterministic hand-off between policy selection and the
 * (Groq or local) response generator.
 */
export interface DialogueTurnPlan {
  primaryGoal: DialogueTurnPrimaryGoal | string;
  secondaryGoal?: string;
  dialogueAct: AssistantDialogueAct;
  /** Operation-aware topic from the latest explicit request, when available. */
  topic?: string;
  primaryOperation?: string;
  secondaryOperations?: string[];
  explicitRequest?: string;
  requestedOutputFormat?: string;
  mustAddress: string[];
  optionalDetails?: string[];
  mustNotDo?: string[];
  /** Resolved topics/moves the reply must not reopen. */
  mustNotRepeat: string[];
  mustNotAssume: string[];
  alreadyKnown?: string[];
  alreadyResolved: string[];
  selectedOption?: string;
  acceptedDraft?: string;
  unresolvedNeed?: string;
  resolvedUserDevelopment?: string;
  requiresEvidence?: boolean;
  requiresCalculation?: boolean;
  shouldAskQuestion: boolean;
  questionPurpose?: DialogueQuestionPurpose;
  nextPendingItem?: PendingConversationItem;
}

export type ShortReplyType = 'affirmation' | 'negation' | 'uncertain_reply' | 'not_short_reply';

export const SHORT_REPLY_TYPE_VALUES: readonly ShortReplyType[] = [
  'affirmation',
  'negation',
  'uncertain_reply',
  'not_short_reply',
];

export interface CurrentTurnEvidence {
  intent: string;
  understanding: string;
  emotion: string;
  barrier: string;
  selfEfficacy: string;
  readiness: string;
  safetyFlag: string;
}

/**
 * The full result of interpreting a single conversational turn —
 * Groq's structured classification output shape, and also what the local
 * fallback classifier synthesizes when Groq is unavailable.
 * `primaryIntent` drives the deterministic policy; `secondaryIntents` may
 * only affect tone, never override the primary request.
 */
export interface CurrentTurnInterpretation {
  primaryIntent: Intent;
  secondaryIntents: Intent[];
  understanding: Understanding;
  emotion: Emotion;
  barrier: Barrier;
  selfEfficacy: SelfEfficacy;
  readiness: Readiness;
  safetyFlag: SafetyFlag;
  currentTurnEvidence: CurrentTurnEvidence;
  refersToPreviousAssistantTurn: boolean;
  shortReplyType: ShortReplyType;
  confidence: number;
}
