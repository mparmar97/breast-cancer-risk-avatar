import type { ResolvedShortReply } from '../dialogue/resolveShortReply';
import type { CurrentTurnInterpretation } from '../dialogue/types';
import {
  createDefaultAdaptiveState,
  normalizeAdaptiveState,
  type AdaptiveState,
  type Barrier,
  type Readiness,
  type Understanding,
} from './state';

const NOT_EXPRESSED_VALUES = new Set(['', 'not expressed', 'none', 'n/a', 'not mentioned', 'not stated']);

function wasExpressed(evidenceText: string): boolean {
  return !NOT_EXPRESSED_VALUES.has(evidenceText.trim().toLowerCase());
}

// A direct informational request must never have its readiness *reduced*
// relative to the previous turn (Rule 9) — ranked low-to-high so a
// same-or-higher check is a simple numeric comparison. "unclear" is
// intentionally excluded from the ranking (treated as "no opinion yet",
// never counted as a reduction).
const READINESS_RANK: Partial<Record<Readiness, number>> = {
  not_considering: 0,
  considering: 1,
  preparing: 2,
  ready: 3,
};

const DIRECT_INFORMATIONAL_INTENTS = new Set(['explain_risk', 'explain_risk_horizon', 'general_question']);

const BARRIER_EXPIRY_UNMENTIONED_TURNS = 1;

export interface StateTransitionInput {
  previousState?: AdaptiveState;
  interpretation: CurrentTurnInterpretation;
  resolvedShortReply: ResolvedShortReply;
  /** Consecutive turns the previously-active barrier has gone unmentioned, from the last turn's {@link StateTransitionMetadata.barrierUnmentionedTurns}. */
  barrierUnmentionedTurns: number;
}

export interface StateTransitionMetadata {
  previousUnderstanding: Understanding;
  currentUnderstanding: Understanding;
  understandingChanged: boolean;
  previousEmotion: AdaptiveState['emotion'];
  currentEmotion: AdaptiveState['emotion'];
  previousBarrier: Barrier;
  currentBarrier: Barrier;
  barrierCleared: boolean;
  previousSelfEfficacy: AdaptiveState['selfEfficacy'];
  currentSelfEfficacy: AdaptiveState['selfEfficacy'];
  previousReadiness: Readiness;
  currentReadiness: Readiness;
  stateChanged: boolean;
  changedFields: string[];
  /** Updated unmentioned-turn count for this barrier — round-tripped by the client for the next turn's expiry check. */
  barrierUnmentionedTurns: number;
}

export interface StateTransitionResult {
  state: AdaptiveState;
  metadata: StateTransitionMetadata;
}

/**
 * The general state-transition engine (Section 8): combines the previous
 * turn's state with this turn's Groq/local interpretation and any
 * deterministically resolved short-reply meaning into a new
 * {@link AdaptiveState}, plus rich diagnostic metadata about exactly what
 * changed and why.
 *
 * Rules implemented (numbered per the spec):
 *   1-2. Current-turn evidence has priority; the previous state is only
 *        contextual fallback for fields with no signal this turn.
 *   3-4. A barrier is cleared or replaced whenever fresh evidence says so
 *        (evidence-priority already achieves "replace"; explicit
 *        `overrideBarrier: 'none'` from a resolved short reply achieves
 *        "clear").
 *   5-6. A barrier that goes unmentioned for more than one turn expires to
 *        "none" rather than persisting indefinitely.
 *   7-8. A resolved short reply's confidence/readiness/understanding
 *        override is applied after the evidence merge, since it is the
 *        most specific available signal for that turn.
 *   9.   A direct informational primaryIntent never reduces readiness
 *        relative to the previous turn.
 *  10.   (Enforced by worker/behavioral/policy.ts, not here — a direct
 *        informational intent always selects `clarify_risk` regardless of
 *        the emotion this function carries forward.)
 *  11.   `safetyFlag` (and `confidence`) are always taken fresh and never
 *        carried forward.
 *  12.   Every field above is re-derived from the *current* interpretation
 *        first, so the user is always free to change their mind.
 *  13.   confirm_understanding raises understanding to correct/partial
 *        without increasing readiness to ready.
 */
export function transitionState(input: StateTransitionInput): StateTransitionResult {
  const { interpretation, resolvedShortReply } = input;
  const previous = input.previousState ? normalizeAdaptiveState(input.previousState) : createDefaultAdaptiveState();
  const evidence = interpretation.currentTurnEvidence;

  let understanding = wasExpressed(evidence.understanding) ? interpretation.understanding : previous.understanding;
  const emotion = wasExpressed(evidence.emotion) ? interpretation.emotion : previous.emotion;
  const selfEfficacyFromEvidence = wasExpressed(evidence.selfEfficacy) ? interpretation.selfEfficacy : previous.selfEfficacy;
  const readinessFromEvidence = wasExpressed(evidence.readiness) ? interpretation.readiness : previous.readiness;

  // Barrier: fresh evidence always wins (covers both "replace" and
  // "continue the same barrier"); otherwise apply the one-turn expiry
  // window before falling back to "carry forward unchanged".
  let barrier: Barrier;
  let barrierUnmentionedTurns: number;
  if (wasExpressed(evidence.barrier)) {
    barrier = interpretation.barrier;
    barrierUnmentionedTurns = 0;
  } else if (previous.barrier === 'none') {
    barrier = 'none';
    barrierUnmentionedTurns = 0;
  } else if (input.barrierUnmentionedTurns >= BARRIER_EXPIRY_UNMENTIONED_TURNS) {
    barrier = 'none';
    barrierUnmentionedTurns = 0;
  } else {
    barrier = previous.barrier;
    barrierUnmentionedTurns = input.barrierUnmentionedTurns + 1;
  }

  let selfEfficacy = selfEfficacyFromEvidence;
  let readiness = readinessFromEvidence;

  // A deterministically resolved short reply (Section 7) is the most
  // specific available signal for this turn and applies after the
  // evidence merge above.
  if (resolvedShortReply.isShortReply && !resolvedShortReply.requiresClarification) {
    if (resolvedShortReply.overrideUnderstanding) understanding = resolvedShortReply.overrideUnderstanding;
    if (resolvedShortReply.overrideSelfEfficacy) selfEfficacy = resolvedShortReply.overrideSelfEfficacy;
    if (resolvedShortReply.overrideReadiness) readiness = resolvedShortReply.overrideReadiness;
    if (resolvedShortReply.overrideBarrier) {
      barrier = resolvedShortReply.overrideBarrier;
      barrierUnmentionedTurns = 0;
    }
  }

  // confirm_understanding must not bump readiness to preparing/ready solely
  // because the user understood an explanation.
  const finalPrimaryIntent = resolvedShortReply.overridePrimaryIntent ?? interpretation.primaryIntent;
  if (finalPrimaryIntent === 'confirm_understanding') {
    readiness = previous.readiness === 'unclear' ? 'unclear' : previous.readiness;
    if (!wasExpressed(evidence.barrier) && !resolvedShortReply.overrideBarrier) {
      barrier = 'none';
      barrierUnmentionedTurns = 0;
    }
  }

  // Accepting a proposed draft advances readiness to preparing without
  // implying the message was already sent.
  if (finalPrimaryIntent === 'confirm_proposed_action') {
    readiness = 'preparing';
  }

  // Greetings, closings, and pure gratitude must not inherit unresolved
  // emotional/barrier labels from earlier turns without current evidence.
  const SOCIAL_RESET_INTENTS = new Set(['greeting', 'social_acknowledgment', 'gratitude', 'conversation_closing']);
  let emotionOut = emotion;
  if (SOCIAL_RESET_INTENTS.has(finalPrimaryIntent)) {
    if (!wasExpressed(evidence.emotion)) emotionOut = 'uncertain';
    if (!wasExpressed(evidence.barrier) && !resolvedShortReply.overrideBarrier) {
      barrier = 'none';
      barrierUnmentionedTurns = 0;
    }
    if (!wasExpressed(evidence.understanding)) understanding = previous.understanding === 'incorrect' ? 'uncertain' : previous.understanding;
  }

  // Rule 9: a direct informational question must not reduce readiness.
  if (DIRECT_INFORMATIONAL_INTENTS.has(finalPrimaryIntent)) {
    const previousRank = READINESS_RANK[previous.readiness];
    const currentRank = READINESS_RANK[readiness];
    if (previousRank !== undefined && currentRank !== undefined && currentRank < previousRank) {
      readiness = previous.readiness;
    }
  }

  const state = normalizeAdaptiveState({
    understanding,
    emotion: emotionOut,
    barrier,
    selfEfficacy,
    readiness,
    safetyFlag: interpretation.safetyFlag,
    confidence: interpretation.confidence,
  });

  const changedFields: string[] = [];
  if (state.understanding !== previous.understanding) changedFields.push('understanding');
  if (state.emotion !== previous.emotion) changedFields.push('emotion');
  if (state.barrier !== previous.barrier) changedFields.push('barrier');
  if (state.selfEfficacy !== previous.selfEfficacy) changedFields.push('selfEfficacy');
  if (state.readiness !== previous.readiness) changedFields.push('readiness');
  if (state.safetyFlag !== previous.safetyFlag) changedFields.push('safetyFlag');

  const metadata: StateTransitionMetadata = {
    previousUnderstanding: previous.understanding,
    currentUnderstanding: state.understanding,
    understandingChanged: state.understanding !== previous.understanding,
    previousEmotion: previous.emotion,
    currentEmotion: state.emotion,
    previousBarrier: previous.barrier,
    currentBarrier: state.barrier,
    barrierCleared: previous.barrier !== 'none' && state.barrier === 'none',
    previousSelfEfficacy: previous.selfEfficacy,
    currentSelfEfficacy: state.selfEfficacy,
    previousReadiness: previous.readiness,
    currentReadiness: state.readiness,
    stateChanged: changedFields.length > 0,
    changedFields,
    barrierUnmentionedTurns,
  };

  return { state, metadata };
}
