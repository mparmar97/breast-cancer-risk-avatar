import type { AvatarExpression } from './types';

/** ElevenLabs-style voice_settings knobs used by LiveAvatar FULL TTS. */
export interface LiveAvatarVoiceAffect {
  /** Style exaggeration 0–1. Higher = more expressive delivery. */
  style: number;
  /** Consistency 0–1. Higher = steadier, less dramatic. */
  stability: number;
}

const DEFAULT_AFFECT: LiveAvatarVoiceAffect = {
  style: 0.2,
  stability: 0.75,
};

/**
 * Map avatar expression cue → LiveAvatar voice_settings affect.
 * Contrasts are intentionally large so delivery is audibly different.
 * Does not change spoken medical text.
 */
export function avatarExpressionToVoiceAffect(
  expression: AvatarExpression,
): LiveAvatarVoiceAffect {
  switch (expression) {
    case 'reassuring':
      // Softer, more emotive — slower companion speed applied separately.
      return { style: 0.55, stability: 0.45 };
    case 'gentle':
      // Flat, steady, low drama for dismissive / overwhelmed turns.
      return { style: 0.0, stability: 0.95 };
    case 'encouraging':
      // Clearly brighter / more expressive.
      return { style: 0.85, stability: 0.3 };
    case 'attentive':
      // Measured, slightly reserved.
      return { style: 0.1, stability: 0.9 };
    case 'neutral':
    default:
      return { ...DEFAULT_AFFECT };
  }
}

export function clampVoiceStyle(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AFFECT.style;
  return Math.min(1, Math.max(0, value));
}

export function clampVoiceStability(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AFFECT.stability;
  return Math.min(1, Math.max(0, value));
}

export function voiceAffectsDiffer(
  a: LiveAvatarVoiceAffect,
  b: LiveAvatarVoiceAffect,
): boolean {
  return (
    Math.abs(a.style - b.style) >= 0.02 || Math.abs(a.stability - b.stability) >= 0.02
  );
}

/** Prefer listening pose after speak for supportive / worried presence. */
export function prefersAttentiveListening(expression: AvatarExpression): boolean {
  return (
    expression === 'reassuring' ||
    expression === 'gentle' ||
    expression === 'attentive'
  );
}
