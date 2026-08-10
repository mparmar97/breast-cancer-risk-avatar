import type { OrchestrationResult } from './types';

export interface InnovationMetadata {
  adaptiveDimensionsUsed: string[];
  decisionalNeedsAddressed: string[];
  theoriesOperationalized: string[];
  medicalEvidenceUsed: string[];
  safetyControlsApplied: string[];
  progressionControlsApplied: string[];
  deliveryMode: 'text' | 'static-avatar' | 'live-avatar';
}

/**
 * Developer/documentation metadata describing which adaptive orchestration
 * capabilities were exercised this turn. Not shown as novelty claims to
 * ordinary end users.
 */
export function buildInnovationMetadata(result: OrchestrationResult): InnovationMetadata {
  const adaptiveDimensionsUsed = [
    'intent',
    'understanding',
    'emotion',
    'barrier',
    'self-efficacy',
    'readiness',
    'safety',
    'confidence',
  ].filter((dimension) => {
    if (dimension === 'intent') return Boolean(result.finalPrimaryIntent);
    if (dimension === 'understanding') return result.adaptiveState.understanding !== 'uncertain';
    if (dimension === 'emotion') return result.adaptiveState.emotion !== 'uncertain' && result.adaptiveState.emotion !== 'calm';
    if (dimension === 'barrier') return result.adaptiveState.barrier !== 'none';
    if (dimension === 'self-efficacy') return result.adaptiveState.selfEfficacy !== 'unknown';
    if (dimension === 'readiness') return result.adaptiveState.readiness !== 'unclear';
    if (dimension === 'safety') return result.adaptiveState.safetyFlag !== 'none' || result.safetyOverrideApplied;
    if (dimension === 'confidence') return result.adaptiveState.confidence > 0;
    return false;
  });

  const decisionalNeedsAddressed: string[] = [];
  if (result.decisionState.primaryDecisionalNeed !== 'none') {
    decisionalNeedsAddressed.push(result.decisionState.primaryDecisionalNeed);
  }
  for (const need of result.decisionState.secondaryDecisionalNeeds) {
    if (!decisionalNeedsAddressed.includes(need)) decisionalNeedsAddressed.push(need);
  }
  if (result.decisionState.selectedOption) {
    decisionalNeedsAddressed.push(`selected_option:${result.decisionState.selectedOption}`);
  }

  const theoriesOperationalized = Array.from(
    new Set(
      [result.theoryConstruct.theory, result.decisionSupportTheoryConstruct.theory].filter(
        (theory) => theory && theory !== 'none',
      ),
    ),
  );

  const safetyControlsApplied: string[] = [];
  if (result.safetyOverrideApplied) safetyControlsApplied.push('fixed_safety_override');
  if (result.orchestrationValidation.safetyPassed) safetyControlsApplied.push('response_safety_validation');
  if (result.orchestrationValidation.medicalGroundingPassed) safetyControlsApplied.push('medical_grounding_validation');

  const progressionControlsApplied: string[] = [];
  if (result.orchestrationValidation.dialogueProgressed) progressionControlsApplied.push('dialogue_progression_validation');
  if (result.orchestrationValidation.repetitionPassed) progressionControlsApplied.push('repetition_validation');
  if (result.regenerationUsed) progressionControlsApplied.push('one_repair_attempt');
  if (result.fallbackUsed) progressionControlsApplied.push('local_grounded_fallback');
  if (result.strategyProgressionApplied) progressionControlsApplied.push('strategy_stagnation_progression');

  return {
    adaptiveDimensionsUsed,
    decisionalNeedsAddressed,
    theoriesOperationalized,
    medicalEvidenceUsed: result.usedEvidenceIds,
    safetyControlsApplied,
    progressionControlsApplied,
    // LiveAvatar delivery is a planned future path; the current prototype is text.
    deliveryMode: 'text',
  };
}
