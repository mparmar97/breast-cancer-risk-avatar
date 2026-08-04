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
  | 'other';

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

const UNDERSTANDING_VALUES: readonly Understanding[] = [
  'correct',
  'partial',
  'incorrect',
  'uncertain',
];
const EMOTION_VALUES: readonly Emotion[] = [
  'calm',
  'worried',
  'overwhelmed',
  'dismissive',
  'uncertain',
];
const BARRIER_VALUES: readonly Barrier[] = [
  'none',
  'fear',
  'time',
  'cost',
  'access',
  'mistrust',
  'uncertainty',
  'other',
];
const SELF_EFFICACY_VALUES: readonly SelfEfficacy[] = ['low', 'moderate', 'high', 'unknown'];
const READINESS_VALUES: readonly Readiness[] = [
  'not_considering',
  'considering',
  'preparing',
  'ready',
  'unclear',
];
const SAFETY_FLAG_VALUES: readonly SafetyFlag[] = [
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
