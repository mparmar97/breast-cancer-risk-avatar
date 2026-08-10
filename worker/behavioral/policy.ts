import type { AdaptiveState, Intent } from './state';

export type DialogueStrategy =
  | 'safety_boundary'
  | 'urgent_referral'
  | 'clarify_risk'
  | 'acknowledge_emotion'
  | 'explain_benefit'
  | 'explore_barrier'
  | 'support_self_efficacy'
  | 'action_planning'
  | 'confirm_progress'
  | 'greet_user'
  | 'close_supportively'
  | 'ask_clarification'
  | 'explore_readiness';

export const DIALOGUE_STRATEGY_VALUES: readonly DialogueStrategy[] = [
  'safety_boundary',
  'urgent_referral',
  'clarify_risk',
  'acknowledge_emotion',
  'explain_benefit',
  'explore_barrier',
  'support_self_efficacy',
  'action_planning',
  'confirm_progress',
  'greet_user',
  'close_supportively',
  'ask_clarification',
  'explore_readiness',
];

export function isDialogueStrategy(value: unknown): value is DialogueStrategy {
  return typeof value === 'string' && (DIALOGUE_STRATEGY_VALUES as readonly string[]).includes(value);
}

/** Safety strategies are never subject to stagnation progression. */
const NON_PROGRESSING_STRATEGIES: ReadonlySet<DialogueStrategy> = new Set([
  'safety_boundary',
  'urgent_referral',
  'greet_user',
  'close_supportively',
  // Draft acceptance / action confirmation must not auto-advance into readiness.
  'confirm_progress',
]);

/**
 * Where a "normal" (non-safety) dialogue strategy should move to next if it
 * has already been used for two consecutive turns and the user is not
 * repeating the same unresolved concern.
 */
const PROGRESSION_MAP: Partial<Record<DialogueStrategy, DialogueStrategy>> = {
  clarify_risk: 'confirm_progress',
  acknowledge_emotion: 'explore_barrier',
  explain_benefit: 'action_planning',
  explore_barrier: 'support_self_efficacy',
  support_self_efficacy: 'action_planning',
  action_planning: 'explore_readiness',
  confirm_progress: 'explore_readiness',
  ask_clarification: 'explore_readiness',
  explore_readiness: 'support_self_efficacy',
};

export interface StrategyProgressionInput {
  candidateStrategy: DialogueStrategy;
  /** Up to the last 2 selected strategies, most-recent-last. */
  recentStrategies: readonly DialogueStrategy[];
  /**
   * True when the user is repeating the same unresolved concern or has
   * explicitly asked for more explanation of the same topic.
   */
  userRepeatsSameConcern: boolean;
}

export interface StrategyProgressionResult {
  strategy: DialogueStrategy;
  strategyRepeated: boolean;
  strategyProgressionApplied: boolean;
}

export function applyStrategyProgression(input: StrategyProgressionInput): StrategyProgressionResult {
  const { candidateStrategy, recentStrategies, userRepeatsSameConcern } = input;

  const strategyRepeated =
    recentStrategies.length >= 2 &&
    recentStrategies[recentStrategies.length - 1] === candidateStrategy &&
    recentStrategies[recentStrategies.length - 2] === candidateStrategy;

  if (
    !strategyRepeated ||
    userRepeatsSameConcern ||
    NON_PROGRESSING_STRATEGIES.has(candidateStrategy) ||
    !PROGRESSION_MAP[candidateStrategy]
  ) {
    return { strategy: candidateStrategy, strategyRepeated, strategyProgressionApplied: false };
  }

  return {
    strategy: PROGRESSION_MAP[candidateStrategy] as DialogueStrategy,
    strategyRepeated: true,
    strategyProgressionApplied: true,
  };
}

export interface SelectDialogueStrategyOptions {
  /**
   * The current turn's classified {@link Intent}. Optional and additive:
   * omitting it reproduces the Phase 3 priority order for state-only
   * fields, so existing callers/tests keep working.
   */
  intent?: Intent;
  /**
   * True when emotion was explicitly expressed in the *current* turn's
   * evidence (not merely carried forward). Old worry must not override
   * direct questions, drafts, next steps, greetings, etc.
   */
  emotionExpressedThisTurn?: boolean;
  /** When set, draft rejection must not reopen readiness exploration. */
  draftStatus?: string;
  /** When set, do not ask the user to re-choose a communication option. */
  selectedCommunicationOption?: string;
  plannedTiming?: string;
}

const DIRECT_INFORMATIONAL_INTENTS: ReadonlySet<Intent> = new Set([
  'explain_risk',
  'explain_risk_horizon',
  'general_question',
]);

const DRAFT_INTENTS: ReadonlySet<Intent> = new Set([
  'request_draft_help',
  'request_draft_review',
  'confirm_proposed_action',
]);

const SOCIAL_OPENING_INTENTS: ReadonlySet<Intent> = new Set([
  'greeting',
  'social_acknowledgment',
]);

/**
 * Selects a single dialogue strategy from the adaptive state using a fixed
 * priority order. Groq never chooses the strategy itself.
 *
 * Priority (highest first):
 *   1. safety (crisis / urgent symptom / diagnosis-treatment boundary)
 *   2. direct factual/explanation request → clarify_risk
 *   3. draft acceptance or action confirmation → confirm_progress
 *   4. draft revision / creation help → action_planning
 *   5. information need / next-step help → clarify_risk or action_planning
 *   6. current explicitly expressed emotion → acknowledge_emotion
 *   7. current explicit barrier → explore_barrier
 *   8. readiness exploration (only when nothing above applies)
 *   9. carried context (lower priority than current draft acceptance)
 */
export function selectDialogueStrategy(
  state: AdaptiveState,
  options: SelectDialogueStrategyOptions = {},
): DialogueStrategy {
  const { intent, emotionExpressedThisTurn, draftStatus, selectedCommunicationOption, plannedTiming } =
    options;

  if (state.safetyFlag === 'emotional_crisis') {
    return 'urgent_referral';
  }

  if (state.safetyFlag === 'urgent_symptom') {
    return 'urgent_referral';
  }

  if (state.safetyFlag === 'diagnosis_request' || state.safetyFlag === 'treatment_request') {
    return 'safety_boundary';
  }

  // Direct informational questions must be answered even if prior emotion/barrier carried forward.
  if (intent && DIRECT_INFORMATIONAL_INTENTS.has(intent)) {
    return 'clarify_risk';
  }

  // Draft rejection — respect the decision without pressure or readiness reopen.
  if (draftStatus === 'rejected') {
    return 'close_supportively';
  }

  // Draft acceptance / confirmation before readiness or emotion reopen.
  if (intent === 'confirm_proposed_action') {
    return 'confirm_progress';
  }

  // Timing already committed this turn — acknowledge progress.
  if (intent === 'confirm_action') {
    return 'action_planning';
  }

  // Communication option already selected — practical help, not readiness.
  if (
    selectedCommunicationOption &&
    (intent === 'express_confidence' || intent === 'unclear') &&
    draftStatus !== 'accepted'
  ) {
    return 'support_self_efficacy';
  }

  // Draft revision / creation help — practical action planning.
  if (intent === 'request_draft_help') {
    return 'action_planning';
  }
  if (intent === 'request_draft_review') {
    return 'confirm_progress';
  }

  if (intent === 'request_next_step') {
    return 'action_planning';
  }

  // Explicit misunderstanding (incorrect/partial) — but not when the user
  // just confirmed understanding or is only greeting/closing/correcting.
  if (
    (state.understanding === 'incorrect' || state.understanding === 'partial') &&
    intent !== 'confirm_understanding' &&
    intent !== 'greeting' &&
    intent !== 'gratitude' &&
    intent !== 'conversation_closing' &&
    intent !== 'correction' &&
    !DRAFT_INTENTS.has(intent as Intent) &&
    !SOCIAL_OPENING_INTENTS.has(intent as Intent)
  ) {
    return 'clarify_risk';
  }

  if (intent && SOCIAL_OPENING_INTENTS.has(intent)) {
    return 'greet_user';
  }

  // Understanding confirmation must not outrank a newly expressed practical barrier.
  if (intent === 'confirm_understanding' && state.barrier !== 'none') {
    return 'explore_barrier';
  }

  if (intent === 'confirm_understanding') {
    return 'confirm_progress';
  }

  // Bare thanks should close warmly — not reopen understanding / next-step menus.
  if (intent === 'gratitude' || intent === 'conversation_closing') {
    return 'close_supportively';
  }

  if (intent === 'correction') {
    return 'ask_clarification';
  }

  if (intent === 'accept_teach_back') {
    return 'clarify_risk';
  }

  // Emotion only when expressed this turn, or when intent is explicitly emotional.
  // Do not let inherited worry hijack clear follow-up questions (e.g. who to contact).
  if (
    (state.emotion === 'overwhelmed' || state.emotion === 'worried') &&
    (emotionExpressedThisTurn || intent === 'express_emotion' || !intent)
  ) {
    if (
      intent === 'express_emotion' ||
      !intent ||
      ((intent === 'affirmation' || intent === 'negation') && emotionExpressedThisTurn)
    ) {
      return 'acknowledge_emotion';
    }
  }

  if (state.barrier !== 'none' && intent !== 'express_confidence') {
    return 'explore_barrier';
  }

  if (intent === 'express_confidence') {
    return 'support_self_efficacy';
  }

  if (state.selfEfficacy === 'low') {
    return 'support_self_efficacy';
  }

  if (state.readiness === 'preparing' || state.readiness === 'ready') {
    return 'action_planning';
  }

  // Do not reopen broad readiness after a selected option, accepted draft, or timing.
  if (selectedCommunicationOption || draftStatus === 'accepted' || plannedTiming) {
    return 'confirm_progress';
  }

  return 'explore_readiness';
}
