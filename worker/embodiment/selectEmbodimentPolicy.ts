import type {
  EmbodimentPolicy,
  EmbodimentPolicyInput,
  EmbodimentPolicyLabel,
} from './types';

function hasExplicitEvidence(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed === 'not expressed' || trimmed === '(not expressed)' || trimmed === 'none') {
    return false;
  }
  return true;
}

/**
 * Map evidence-supported adaptive state → delivery policy.
 * Does not invent emotion. Does not change medical text.
 */
export function selectEmbodimentPolicy(input: EmbodimentPolicyInput): EmbodimentPolicy {
  const { adaptiveState, currentTurnEvidence, capabilities } = input;
  const emotionEvidence = currentTurnEvidence?.emotion;
  const understandingEvidence = currentTurnEvidence?.understanding;
  const selfEfficacyEvidence = currentTurnEvidence?.selfEfficacy;

  const emotionSupported = hasExplicitEvidence(emotionEvidence);
  const understandingSupported = hasExplicitEvidence(understandingEvidence);
  const efficacySupported = hasExplicitEvidence(selfEfficacyEvidence);

  let deliveryTone: EmbodimentPolicy['deliveryTone'] = 'neutral';
  let speakingPace: EmbodimentPolicy['speakingPace'] = 'normal';
  let responseEnergy: EmbodimentPolicy['responseEnergy'] = 'neutral';
  let avatarExpression: EmbodimentPolicy['avatarExpression'] = 'neutral';

  // CASE D — frustration / dismissive: avoid exaggerated positive delivery
  if (
    emotionSupported &&
    (adaptiveState.emotion === 'dismissive' || adaptiveState.emotion === 'overwhelmed')
  ) {
    deliveryTone = 'neutral';
    speakingPace = 'slightly_slow';
    responseEnergy = 'gentle';
    avatarExpression = 'gentle';
  }
  // CASE B — worry with explicit evidence
  else if (emotionSupported && adaptiveState.emotion === 'worried') {
    deliveryTone = 'supportive';
    speakingPace = 'slightly_slow';
    responseEnergy = 'gentle';
    avatarExpression = 'reassuring';
  }
  // CASE C — correct understanding + improving self-efficacy with evidence
  else if (
    understandingSupported &&
    adaptiveState.understanding === 'correct' &&
    efficacySupported &&
    (adaptiveState.selfEfficacy === 'moderate' || adaptiveState.selfEfficacy === 'high')
  ) {
    deliveryTone = 'warm';
    speakingPace = 'normal';
    responseEnergy = 'positive';
    avatarExpression = 'encouraging';
  }
  // CASE A — uncertain understanding, no emotion expressed → neutral/normal
  else if (
    adaptiveState.understanding === 'uncertain' &&
    (!emotionSupported || adaptiveState.emotion === 'uncertain' || adaptiveState.emotion === 'calm')
  ) {
    deliveryTone = 'neutral';
    speakingPace = 'normal';
    responseEnergy = 'neutral';
    avatarExpression = 'attentive';
  }

  return {
    deliveryTone,
    speakingPace,
    responseEnergy,
    avatarExpression,
    explicitGestureControlSupported: capabilities.gesture,
    explicitFacialExpressionControlSupported: capabilities.facialExpression,
    rationaleEvidence: {
      emotionEvidence: emotionEvidence?.trim() || undefined,
      understandingEvidence: understandingEvidence?.trim() || undefined,
      selfEfficacyEvidence: selfEfficacyEvidence?.trim() || undefined,
    },
  };
}

export function embodimentPolicyLabel(policy: EmbodimentPolicy): EmbodimentPolicyLabel {
  if (policy.avatarExpression === 'reassuring') return 'supportive_slow';
  if (policy.avatarExpression === 'encouraging') return 'warm_normal';
  if (policy.avatarExpression === 'gentle') return 'gentle_frustrated';
  if (policy.deliveryTone === 'supportive' && policy.speakingPace === 'slightly_slow') {
    return 'supportive_slow';
  }
  if (policy.deliveryTone === 'warm') return 'warm_normal';
  if (policy.responseEnergy === 'gentle' && policy.deliveryTone === 'neutral') {
    return 'gentle_frustrated';
  }
  return 'neutral_normal';
}
