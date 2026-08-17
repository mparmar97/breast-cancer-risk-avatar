import type { AdaptiveState } from '../behavioral/state';
import type { EmbodimentCapabilities } from '../liveavatar/types';

export type DeliveryTone = 'neutral' | 'warm' | 'supportive';
export type SpeakingPace = 'normal' | 'slightly_slow';
export type ResponseEnergy = 'neutral' | 'gentle' | 'positive';

/**
 * Presence cue derived from evidence-supported adaptive state.
 * LiveAvatar has no facial-morph API — this drives voice affect, listening
 * pose preference, and UI presence chrome (not invented medical content).
 */
export type AvatarExpression =
  | 'neutral'
  | 'attentive'
  | 'reassuring'
  | 'gentle'
  | 'encouraging';

/**
 * How a validated response may be embodied. Never changes factual content.
 * Theory does NOT directly map to provider facial morphs.
 */
export interface EmbodimentPolicy {
  deliveryTone: DeliveryTone;
  speakingPace: SpeakingPace;
  responseEnergy: ResponseEnergy;
  /** Adaptive-state → avatar presence / voice-affect cue. */
  avatarExpression: AvatarExpression;
  explicitGestureControlSupported: boolean;
  explicitFacialExpressionControlSupported: boolean;
  rationaleEvidence: {
    emotionEvidence?: string;
    understandingEvidence?: string;
    selfEfficacyEvidence?: string;
  };
}

export interface EmbodimentPolicyInput {
  adaptiveState: AdaptiveState;
  currentTurnEvidence?: {
    emotion?: string;
    understanding?: string;
    selfEfficacy?: string;
  };
  capabilities: EmbodimentCapabilities;
}

export type EmbodimentPolicyLabel =
  | 'neutral_normal'
  | 'supportive_slow'
  | 'warm_normal'
  | 'gentle_frustrated';
