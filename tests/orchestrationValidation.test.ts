import { describe, expect, it } from 'vitest';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { validateOrchestration } from '../worker/orchestration/validateOrchestration';
import type { DialogueTurnPlan } from '../worker/dialogue/types';
import type { DecisionSupportTurnPlan } from '../worker/decisionSupport/types';

const plan: DialogueTurnPlan = {
  primaryGoal: 'provide_practical_help',
  dialogueAct: 'plan_action',
  mustAddress: ['next step'],
  mustNotRepeat: [],
  mustNotAssume: [],
  alreadyResolved: [],
  shouldAskQuestion: true,
};

const decisionPlan: DecisionSupportTurnPlan = {
  primaryGoal: 'clarify_available_options',
  mustAddress: ['options'],
  mustNotAssume: [],
  preserveSelectedOption: true,
  shouldAskQuestion: false,
};

describe('orchestrationValidation', () => {
  it('flags forgotten selected-option questioning', () => {
    const decisionState = {
      ...createDefaultDecisionSupportState(),
      selectedOption: 'portal message',
      primaryDecisionalNeed: 'insufficient_support' as const,
    };
    const result = validateOrchestration({
      reply: 'Would you prefer to call or write to the clinic?',
      primaryIntent: 'request_draft_help',
      dialogueTurnPlan: plan,
      decisionSupportTurnPlan: decisionPlan,
      decisionState,
      previousDecisionState: decisionState,
      adaptiveTransition: {
        previousUnderstanding: 'correct',
        currentUnderstanding: 'correct',
        understandingChanged: false,
        previousEmotion: 'uncertain',
        currentEmotion: 'uncertain',
        previousBarrier: 'none',
        currentBarrier: 'none',
        barrierCleared: false,
        previousSelfEfficacy: 'moderate',
        currentSelfEfficacy: 'moderate',
        previousReadiness: 'preparing',
        currentReadiness: 'preparing',
        stateChanged: false,
        changedFields: [],
        barrierUnmentionedTurns: 0,
      },
      decisionTransition: {
        previousNeed: 'insufficient_support',
        currentNeed: 'insufficient_support',
        previousStage: 'preparing_action',
        currentStage: 'preparing_action',
        previousSelectedOption: 'portal message',
        currentSelectedOption: 'portal message',
        selectedOptionPreserved: true,
        informationNeedResolvedThisTurn: false,
        decisionDeferredThisTurn: false,
        actionConfirmedThisTurn: false,
        draftAcceptedThisTurn: false,
        draftStatus: 'none',
        decisionNeedResolved: false,
        unnecessaryReconsiderationDetected: false,
        changedFields: [],
        stateChanged: false,
      },
      usedEvidenceIds: [],
      retrievedEvidenceCount: 0,
      safetyOverrideApplied: false,
      responseMode: 'local-rag-fallback',
      dialogueAdvanced: true,
      primaryGoalSatisfied: true,
      unsupportedAssumptionDetected: false,
      resolvedIssueRepeated: false,
      repetitionDetected: false,
      regenerationUsed: false,
    });

    expect(result.selectedOptionPreserved).toBe(false);
  });

  it('rejects pressure and unsupported clinical claims language', () => {
    const result = validateOrchestration({
      reply: 'You must schedule an appointment now. This replaces a clinician and reduces decisional conflict.',
      primaryIntent: 'request_next_step',
      dialogueTurnPlan: plan,
      decisionSupportTurnPlan: decisionPlan,
      decisionState: createDefaultDecisionSupportState(),
      adaptiveTransition: {
        previousUnderstanding: 'uncertain',
        currentUnderstanding: 'uncertain',
        understandingChanged: false,
        previousEmotion: 'uncertain',
        currentEmotion: 'uncertain',
        previousBarrier: 'none',
        currentBarrier: 'none',
        barrierCleared: false,
        previousSelfEfficacy: 'unknown',
        currentSelfEfficacy: 'unknown',
        previousReadiness: 'unclear',
        currentReadiness: 'unclear',
        stateChanged: false,
        changedFields: [],
        barrierUnmentionedTurns: 0,
      },
      decisionTransition: {
        previousNeed: 'none',
        currentNeed: 'unclear_options',
        previousStage: 'not_started',
        currentStage: 'option_clarification',
        previousSelectedOption: null,
        currentSelectedOption: null,
        selectedOptionPreserved: false,
        informationNeedResolvedThisTurn: false,
        decisionDeferredThisTurn: false,
        actionConfirmedThisTurn: false,
        draftAcceptedThisTurn: false,
        draftStatus: 'none',
        decisionNeedResolved: false,
        unnecessaryReconsiderationDetected: false,
        changedFields: ['primaryDecisionalNeed'],
        stateChanged: true,
      },
      usedEvidenceIds: [],
      retrievedEvidenceCount: 1,
      safetyOverrideApplied: false,
      responseMode: 'local-rag-fallback',
      dialogueAdvanced: true,
      primaryGoalSatisfied: true,
      unsupportedAssumptionDetected: true,
      resolvedIssueRepeated: false,
      repetitionDetected: false,
      regenerationUsed: false,
    });

    expect(result.safetyPassed).toBe(false);
    expect(result.unsupportedAssumptionDetected).toBe(true);
  });

  it('accepts a grounded next-step reply when options are unclear', () => {
    void createDefaultAdaptiveState;
    const result = validateOrchestration({
      reply:
        'A general next step many people choose is to share the demonstration estimate with a healthcare professional. Would writing a brief portal message feel manageable?',
      primaryIntent: 'request_next_step',
      dialogueTurnPlan: plan,
      decisionSupportTurnPlan: decisionPlan,
      decisionState: {
        ...createDefaultDecisionSupportState(),
        primaryDecisionalNeed: 'unclear_options',
      },
      adaptiveTransition: {
        previousUnderstanding: 'correct',
        currentUnderstanding: 'correct',
        understandingChanged: false,
        previousEmotion: 'worried',
        currentEmotion: 'worried',
        previousBarrier: 'none',
        currentBarrier: 'none',
        barrierCleared: false,
        previousSelfEfficacy: 'unknown',
        currentSelfEfficacy: 'unknown',
        previousReadiness: 'considering',
        currentReadiness: 'considering',
        stateChanged: false,
        changedFields: [],
        barrierUnmentionedTurns: 0,
      },
      decisionTransition: {
        previousNeed: 'resolved',
        currentNeed: 'unclear_options',
        previousStage: 'option_clarification',
        currentStage: 'option_clarification',
        previousSelectedOption: null,
        currentSelectedOption: null,
        selectedOptionPreserved: false,
        informationNeedResolvedThisTurn: false,
        decisionDeferredThisTurn: false,
        actionConfirmedThisTurn: false,
        draftAcceptedThisTurn: false,
        draftStatus: 'none',
        decisionNeedResolved: false,
        unnecessaryReconsiderationDetected: false,
        changedFields: ['primaryDecisionalNeed'],
        stateChanged: true,
      },
      usedEvidenceIds: ['nci-professional-interpretation-001'],
      retrievedEvidenceCount: 1,
      safetyOverrideApplied: false,
      responseMode: 'local-rag-fallback',
      dialogueAdvanced: true,
      primaryGoalSatisfied: true,
      unsupportedAssumptionDetected: false,
      resolvedIssueRepeated: false,
      repetitionDetected: false,
      regenerationUsed: false,
    });

    expect(result.decisionalNeedAddressed).toBe(true);
    expect(result.safetyPassed).toBe(true);
    expect(result.primaryIntentAddressed).toBe(true);
  });
});
