import type { AvatarExpression, SpeakingPace } from './types';
import {
  clampLiveAvatarVoiceSpeed,
  LIVEAVATAR_VOICE_SPEED_DEFAULT,
  speakingPaceToVoiceSpeed,
} from './voiceSpeed';
import {
  avatarExpressionToVoiceAffect,
  clampVoiceStability,
  clampVoiceStyle,
  type LiveAvatarVoiceAffect,
} from './voiceAffect';

/** Full FULL-mode voice_settings bundle locked at session-token creation. */
export interface LiveAvatarVoiceSettings extends LiveAvatarVoiceAffect {
  speed: number;
}

/**
 * Map embodiment cues → clearly audible LiveAvatar voice settings.
 * Speed is the main differentiator; style/stability amplify when the
 * provider honors ElevenLabs-compatible knobs.
 */
export function embodimentToLiveAvatarVoice(input: {
  avatarExpression: AvatarExpression;
  speakingPace: SpeakingPace;
}): LiveAvatarVoiceSettings {
  const paceSpeed = speakingPaceToVoiceSpeed(input.speakingPace);
  const affect = avatarExpressionToVoiceAffect(input.avatarExpression);

  // Expression can push speed further apart than pace alone (0.85 vs 1.0
  // is easy to miss; 0.8 vs 1.15 is clearly different).
  let speed = paceSpeed;
  switch (input.avatarExpression) {
    case 'reassuring':
      speed = 0.8;
      break;
    case 'gentle':
      speed = 0.82;
      break;
    case 'encouraging':
      speed = 1.15;
      break;
    case 'attentive':
      speed = 0.95;
      break;
    case 'neutral':
    default:
      speed = LIVEAVATAR_VOICE_SPEED_DEFAULT;
      break;
  }

  return {
    speed: clampLiveAvatarVoiceSpeed(speed),
    style: clampVoiceStyle(affect.style),
    stability: clampVoiceStability(affect.stability),
  };
}
