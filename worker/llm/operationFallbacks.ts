/**
 * Operation-specific grounded local fallbacks.
 * Prefer plan-aware composition; keep a thin operation adapter for callers
 * that still pass RequestInterpretation.
 */

import type { RequestInterpretation } from '../dialogue/currentTurnInterpretation';
import type { ResponsePlan } from '../dialogue/deriveResponsePlan';
import { deriveResponsePlan } from '../dialogue/deriveResponsePlan';
import { createDefaultConversationMemory } from '../dialogue/conversationMemory';
import type { NaturalFrequencyResult } from '../risk/convertRiskToNaturalFrequency';
import type { RetrievedEvidence } from '../rag/types';
import type { RiskResult } from '../types';
import { understandingNextStepFallback } from './fallbackCopy';
import { generatePlanAwareFallback } from './planAwareFallback';

export interface OperationFallbackInput {
  interpretation: RequestInterpretation;
  riskResult: RiskResult;
  calculation?: NaturalFrequencyResult | null;
  plan?: ResponsePlan;
  retrievedEvidence?: RetrievedEvidence[];
  latestMessage?: string;
  recentAssistantMessages?: string[];
}

/**
 * Operation-specific grounded local fallbacks. Used only when Groq is
 * unavailable or fails validation/repair — never as the primary dynamic path.
 */
export function generateOperationFallback(input: OperationFallbackInput): string {
  const semantic =
    input.interpretation.semanticTurn ??
    undefined;

  if (semantic) {
    const plan =
      input.plan ??
      deriveResponsePlan({
        semanticTurn: semantic,
        conversationMemory: createDefaultConversationMemory(),
        riskResult: input.riskResult,
      });
    return generatePlanAwareFallback({
      semanticTurn: semantic,
      plan,
      riskResult: input.riskResult,
      calculation: input.calculation,
      retrievedEvidence: input.retrievedEvidence,
      latestMessage: input.latestMessage,
      recentAssistantMessages: input.recentAssistantMessages,
    });
  }

  // Minimal legacy path when no semantic turn is attached.
  const percent =
    input.calculation?.originalRiskPercent ??
    input.interpretation.entities.riskValue ??
    input.riskResult.fiveYearRisk;
  const horizon = input.calculation?.timeHorizon ?? input.riskResult.riskHorizon;
  const frequency =
    input.calculation?.approximationText ?? `about ${Math.round(percent)} out of 100`;

  switch (input.interpretation.operation) {
    case 'convert':
      return `Over five years, ${frequency} people with similar calculator information may develop breast cancer. This is an approximate way to picture the probability, not a prediction for any one person.`;
    case 'verify_understanding':
      return understandingNextStepFallback(input.riskResult);
    case 'correct_misunderstanding':
      return `A calculator estimates probability for people with similar input information. It cannot predict exactly what will happen to one person and is not a diagnosis.`;
    case 'provide_options':
      return `A general next step many people choose is to share the demonstration estimate with a healthcare professional, for example by a brief portal message or at an existing visit.`;
    case 'plan_action':
      return `One simple place to start is to open your patient portal and paste a short message asking for help interpreting the demonstration estimate.`;
    case 'confirm_action':
      return 'The draft is ready to use. When would you like to send it?';
    case 'draft':
    case 'revise':
      return `Here is a short editable draft: "Hi, I got a demo breast-cancer risk estimate and would like help understanding it with my personal and family history. Thanks." You can change any wording before sending.`;
    default:
      return `A risk estimate of about ${percent}% over ${horizon} describes probability for people with similar calculator information. It is not a diagnosis.`;
  }
}
