import { describe, expect, it } from 'vitest';
import { selectEmbodimentPolicy } from '../worker/embodiment/selectEmbodimentPolicy';
import {
  clampLiveAvatarVoiceSpeed,
  speakingPaceToVoiceSpeed,
} from '../worker/embodiment/voiceSpeed';
import { embodimentToLiveAvatarVoice } from '../worker/embodiment/liveAvatarVoice';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { LIVEAVATAR_LITE_CAPABILITIES } from '../worker/liveavatar/types';

describe('selectEmbodimentPolicy', () => {
  it('CASE A: uncertain understanding + no emotion evidence → neutral/attentive', () => {
    const state = {
      ...createDefaultAdaptiveState(),
      understanding: 'uncertain' as const,
      emotion: 'uncertain' as const,
    };
    const policy = selectEmbodimentPolicy({
      adaptiveState: state,
      currentTurnEvidence: { emotion: 'not expressed', understanding: 'user said maybe' },
      capabilities: LIVEAVATAR_LITE_CAPABILITIES,
    });
    expect(policy.deliveryTone).toBe('neutral');
    expect(policy.speakingPace).toBe('normal');
    expect(policy.avatarExpression).toBe('attentive');
    expect(speakingPaceToVoiceSpeed(policy.speakingPace)).toBe(1);
    expect(policy.explicitFacialExpressionControlSupported).toBe(false);
    expect(policy.explicitGestureControlSupported).toBe(false);
  });

  it('CASE B: worry with explicit evidence → supportive/slightly_slow/reassuring', () => {
    const state = {
      ...createDefaultAdaptiveState(),
      emotion: 'worried' as const,
    };
    const policy = selectEmbodimentPolicy({
      adaptiveState: state,
      currentTurnEvidence: { emotion: 'I am worried about this result' },
      capabilities: LIVEAVATAR_LITE_CAPABILITIES,
    });
    expect(policy.deliveryTone).toBe('supportive');
    expect(policy.speakingPace).toBe('slightly_slow');
    expect(policy.avatarExpression).toBe('reassuring');
    expect(speakingPaceToVoiceSpeed(policy.speakingPace)).toBe(0.8);
  });

  it('CASE C: correct + improving self-efficacy with evidence → warm/encouraging', () => {
    const state = {
      ...createDefaultAdaptiveState(),
      understanding: 'correct' as const,
      selfEfficacy: 'high' as const,
    };
    const policy = selectEmbodimentPolicy({
      adaptiveState: state,
      currentTurnEvidence: {
        understanding: 'user restated the five-year meaning correctly',
        selfEfficacy: 'I feel more confident now',
      },
      capabilities: LIVEAVATAR_LITE_CAPABILITIES,
    });
    expect(policy.deliveryTone).toBe('warm');
    expect(policy.speakingPace).toBe('normal');
    expect(policy.avatarExpression).toBe('encouraging');
  });

  it('CASE D: dismissive with evidence avoids exaggerated positive delivery', () => {
    const state = {
      ...createDefaultAdaptiveState(),
      emotion: 'dismissive' as const,
    };
    const policy = selectEmbodimentPolicy({
      adaptiveState: state,
      currentTurnEvidence: { emotion: 'this is pointless' },
      capabilities: LIVEAVATAR_LITE_CAPABILITIES,
    });
    expect(policy.deliveryTone).toBe('neutral');
    expect(policy.responseEnergy).toBe('gentle');
    expect(policy.avatarExpression).toBe('gentle');
    expect(policy.speakingPace).toBe('slightly_slow');
    expect(policy.responseEnergy).not.toBe('positive');
  });

  it('does not treat emotion as expressed without evidence', () => {
    const state = {
      ...createDefaultAdaptiveState(),
      emotion: 'worried' as const,
      understanding: 'uncertain' as const,
    };
    const policy = selectEmbodimentPolicy({
      adaptiveState: state,
      currentTurnEvidence: { emotion: 'not expressed' },
      capabilities: LIVEAVATAR_LITE_CAPABILITIES,
    });
    expect(policy.deliveryTone).toBe('neutral');
    expect(policy.speakingPace).toBe('normal');
    expect(policy.avatarExpression).toBe('attentive');
  });
});

describe('speakingPaceToVoiceSpeed', () => {
  it('clamps to LiveAvatar shared speed range', () => {
    expect(clampLiveAvatarVoiceSpeed(0.5)).toBe(0.8);
    expect(clampLiveAvatarVoiceSpeed(2)).toBe(1.2);
    expect(clampLiveAvatarVoiceSpeed(Number.NaN)).toBe(1);
  });
});

describe('embodimentToLiveAvatarVoice', () => {
  it('spreads speeds so adaptive states are audibly different', () => {
    const reassuring = embodimentToLiveAvatarVoice({
      avatarExpression: 'reassuring',
      speakingPace: 'slightly_slow',
    });
    const encouraging = embodimentToLiveAvatarVoice({
      avatarExpression: 'encouraging',
      speakingPace: 'normal',
    });
    const gentle = embodimentToLiveAvatarVoice({
      avatarExpression: 'gentle',
      speakingPace: 'slightly_slow',
    });
    expect(reassuring.speed).toBe(0.8);
    expect(encouraging.speed).toBe(1.15);
    expect(gentle.speed).toBe(0.82);
    expect(encouraging.style).toBeGreaterThan(reassuring.style);
    expect(gentle.stability).toBeGreaterThan(encouraging.stability);
    expect(encouraging.speed - reassuring.speed).toBeGreaterThanOrEqual(0.3);
  });
});
