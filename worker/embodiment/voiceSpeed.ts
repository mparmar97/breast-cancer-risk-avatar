import type { SpeakingPace } from './types';

/** LiveAvatar FULL voice_settings.speed range (shared providers). */
export const LIVEAVATAR_VOICE_SPEED_MIN = 0.8;
export const LIVEAVATAR_VOICE_SPEED_MAX = 1.2;
export const LIVEAVATAR_VOICE_SPEED_DEFAULT = 1.0;

/**
 * Map adaptive speakingPace → LiveAvatar built-in TTS speed.
 * Use the low end of the documented 0.8–1.2 range so "slow" is audible.
 */
export function speakingPaceToVoiceSpeed(pace: SpeakingPace): number {
  if (pace === 'slightly_slow') return LIVEAVATAR_VOICE_SPEED_MIN;
  return LIVEAVATAR_VOICE_SPEED_DEFAULT;
}

export function clampLiveAvatarVoiceSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return LIVEAVATAR_VOICE_SPEED_DEFAULT;
  return Math.min(
    LIVEAVATAR_VOICE_SPEED_MAX,
    Math.max(LIVEAVATAR_VOICE_SPEED_MIN, speed),
  );
}

export function parseSpeakingPace(value: unknown): SpeakingPace | undefined {
  if (value === 'normal' || value === 'slightly_slow') return value;
  return undefined;
}
