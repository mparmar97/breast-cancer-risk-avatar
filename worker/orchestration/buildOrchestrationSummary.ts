import type { OrchestrationResult } from './types';

export interface OrchestrationSummary {
  primaryIntent: string;
  secondaryIntents: string[];
  dialogueStrategy: string;
  decisionSupportStrategy: string;
  adaptiveBarrier: string;
  adaptiveReadiness: string;
  decisionTopic: string;
  decisionStage: string;
  primaryDecisionalNeed: string;
  selectedOption: string | null;
  theories: string[];
  usedEvidenceIds: string[];
  safetyOverrideApplied: boolean;
  fallbackUsed: boolean;
  decisionNeedAddressed: boolean;
  deliveryMode: string;
}

/**
 * Compact developer-facing summary of one orchestration turn.
 */
export function buildOrchestrationSummary(result: OrchestrationResult): OrchestrationSummary {
  return {
    primaryIntent: result.finalPrimaryIntent,
    secondaryIntents: result.secondaryIntents,
    dialogueStrategy: result.dialogueStrategy,
    decisionSupportStrategy: result.decisionSupportStrategy,
    adaptiveBarrier: result.adaptiveState.barrier,
    adaptiveReadiness: result.adaptiveState.readiness,
    decisionTopic: result.decisionState.decisionTopic,
    decisionStage: result.decisionState.decisionStage,
    primaryDecisionalNeed: result.decisionState.primaryDecisionalNeed,
    selectedOption: result.decisionState.selectedOption,
    theories: result.innovationMetadata.theoriesOperationalized,
    usedEvidenceIds: result.usedEvidenceIds,
    safetyOverrideApplied: result.safetyOverrideApplied,
    fallbackUsed: result.fallbackUsed,
    decisionNeedAddressed: result.decisionNeedAddressed,
    deliveryMode: result.innovationMetadata.deliveryMode,
  };
}
