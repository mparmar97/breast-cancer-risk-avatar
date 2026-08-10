export type Understanding = 'correct' | 'partial' | 'incorrect' | 'uncertain';

export type Emotion = 'calm' | 'worried' | 'overwhelmed' | 'dismissive' | 'uncertain';

export type Barrier =
  | 'none'
  | 'fear'
  | 'time'
  | 'cost'
  | 'access'
  | 'mistrust'
  | 'uncertainty'
  | 'delay'
  | 'other';

/**
 * A single-turn estimate of *why* the user sent this message. Unlike the
 * core `AdaptiveState` fields above (which persist/carry across turns via
 * {@link normalizeAdaptiveState} and the classifiers' fallback merging),
 * `Intent` is always recomputed fresh per turn and is never carried
 * forward — it exists only to let the deterministic dialogue policy
 * (`worker/behavioral/policy.ts`) recognize a handful of Phase 5
 * cross-cutting cases (e.g. "a direct informational question should be
 * answered directly, even if a previous turn carried an emotion or
 * barrier forward") without weakening the original Phase 3 priority
 * order when no intent is supplied. It is not part of the public
 * `AdaptiveState` shape and is never itself returned to the frontend —
 * only a short natural-language rationale for it appears in
 * `currentTurnEvidence.intent` (see worker/llm/classifyAdaptiveState.ts).
 */
export type Intent =
  | 'greeting'
  | 'gratitude'
  | 'conversation_closing'
  | 'social_acknowledgment'
  | 'explain_risk'
  | 'explain_risk_horizon'
  | 'diagnosis_question'
  | 'treatment_question'
  | 'symptom_report'
  | 'express_emotion'
  | 'describe_barrier'
  | 'express_confidence'
  | 'express_ambivalence'
  | 'request_next_step'
  | 'confirm_action'
  | 'confirm_understanding'
  | 'accept_teach_back'
  | 'request_draft_help'
  | 'request_draft_review'
  | 'confirm_proposed_action'
  | 'correction'
  | 'general_question'
  | 'affirmation'
  | 'negation'
  | 'unclear';

export type SelfEfficacy = 'low' | 'moderate' | 'high' | 'unknown';

export type Readiness = 'not_considering' | 'considering' | 'preparing' | 'ready' | 'unclear';

export type SafetyFlag =
  | 'none'
  | 'diagnosis_request'
  | 'treatment_request'
  | 'urgent_symptom'
  | 'emotional_crisis'
  | 'out_of_scope';

/**
 * A temporary, conversational-turn estimate of the user's current
 * understanding, emotional state, and readiness to follow up on a
 * demonstration risk result.
 *
 * This is NOT a psychological or clinical assessment. It is a lightweight,
 * deterministic heuristic used only to select a supportive dialogue
 * strategy for this single reply, and must never be presented to end users
 * as a diagnosis of any kind.
 */
export interface AdaptiveState {
  understanding: Understanding;
  emotion: Emotion;
  barrier: Barrier;
  selfEfficacy: SelfEfficacy;
  readiness: Readiness;
  safetyFlag: SafetyFlag;
  /** Always within [0, 1]. See {@link normalizeAdaptiveState}. */
  confidence: number;
}

export const DEFAULT_ADAPTIVE_STATE: AdaptiveState = {
  understanding: 'uncertain',
  emotion: 'uncertain',
  barrier: 'none',
  selfEfficacy: 'unknown',
  readiness: 'unclear',
  safetyFlag: 'none',
  confidence: 0.4,
};

export const UNDERSTANDING_VALUES: readonly Understanding[] = [
  'correct',
  'partial',
  'incorrect',
  'uncertain',
];
export const EMOTION_VALUES: readonly Emotion[] = [
  'calm',
  'worried',
  'overwhelmed',
  'dismissive',
  'uncertain',
];
export const BARRIER_VALUES: readonly Barrier[] = [
  'none',
  'fear',
  'time',
  'cost',
  'access',
  'mistrust',
  'uncertainty',
  'delay',
  'other',
];

export const INTENT_VALUES: readonly Intent[] = [
  'greeting',
  'gratitude',
  'conversation_closing',
  'social_acknowledgment',
  'explain_risk',
  'explain_risk_horizon',
  'diagnosis_question',
  'treatment_question',
  'symptom_report',
  'express_emotion',
  'describe_barrier',
  'express_confidence',
  'express_ambivalence',
  'request_next_step',
  'confirm_action',
  'confirm_understanding',
  'accept_teach_back',
  'request_draft_help',
  'request_draft_review',
  'confirm_proposed_action',
  'correction',
  'general_question',
  'affirmation',
  'negation',
  'unclear',
];

export function isIntent(value: unknown): value is Intent {
  return typeof value === 'string' && (INTENT_VALUES as readonly string[]).includes(value);
}
export const SELF_EFFICACY_VALUES: readonly SelfEfficacy[] = ['low', 'moderate', 'high', 'unknown'];
export const READINESS_VALUES: readonly Readiness[] = [
  'not_considering',
  'considering',
  'preparing',
  'ready',
  'unclear',
];
export const SAFETY_FLAG_VALUES: readonly SafetyFlag[] = [
  'none',
  'diagnosis_request',
  'treatment_request',
  'urgent_symptom',
  'emotional_crisis',
  'out_of_scope',
];

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function clampConfidence(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_ADAPTIVE_STATE.confidence;
  return Math.min(1, Math.max(0, numeric));
}

export function createDefaultAdaptiveState(): AdaptiveState {
  return { ...DEFAULT_ADAPTIVE_STATE };
}

/**
 * Normalizes an arbitrary (possibly partial, stale, or corrupted) value into
 * a fully valid AdaptiveState. Every field is coerced to one of its allowed
 * enum values and confidence is always clamped to [0, 1], so invalid data
 * (e.g. loaded from client-supplied JSON or localStorage) can never produce
 * an out-of-range or nonsensical state.
 */
export function normalizeAdaptiveState(input: Partial<AdaptiveState> | null | undefined): AdaptiveState {
  if (!input || typeof input !== 'object') {
    return createDefaultAdaptiveState();
  }

  return {
    understanding: pickEnum(input.understanding, UNDERSTANDING_VALUES, DEFAULT_ADAPTIVE_STATE.understanding),
    emotion: pickEnum(input.emotion, EMOTION_VALUES, DEFAULT_ADAPTIVE_STATE.emotion),
    barrier: pickEnum(input.barrier, BARRIER_VALUES, DEFAULT_ADAPTIVE_STATE.barrier),
    selfEfficacy: pickEnum(input.selfEfficacy, SELF_EFFICACY_VALUES, DEFAULT_ADAPTIVE_STATE.selfEfficacy),
    readiness: pickEnum(input.readiness, READINESS_VALUES, DEFAULT_ADAPTIVE_STATE.readiness),
    safetyFlag: pickEnum(input.safetyFlag, SAFETY_FLAG_VALUES, DEFAULT_ADAPTIVE_STATE.safetyFlag),
    confidence: clampConfidence(input.confidence),
  };
}
