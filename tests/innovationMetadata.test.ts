import { describe, expect, it } from 'vitest';
import { buildInnovationMetadata } from '../worker/orchestration/innovationMetadata';
import type { OrchestrationResult } from '../worker/orchestration/types';
import { createDefaultDecisionSupportState } from '../worker/decisionSupport/types';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { getTheoryConstruct } from '../worker/behavioral/theoryMap';
import { getDecisionSupportTheoryConstruct } from '../worker/decisionSupport/theoryMap';
import { createDefaultConversationMemory } from '../worker/dialogue/conversationMemory';
import { NO_PENDING_ITEM } from '../worker/dialogue/types';

function baseResult(overrides: Partial<OrchestrationResult> = {}): OrchestrationResult {
  const adaptiveState = createDefaultAdaptiveState();
  adaptiveState.understanding = 'correct';
  adaptiveState.barrier = 'time';
  const decisionState = {
    ...createDefaultDecisionSupportState(),
    primaryDecisionalNeed: 'unclear_options' as const,
    selectedOption: 'portal message',
  };
  const theoryConstruct = getTheoryConstruct('clarify_risk');
  const decisionSupportTheoryConstruct = getDecisionSupportTheoryConstruct('clarify_options');

  return {
    currentTurnInterpretation: {
      primaryIntent: 'request_next_step',
      secondaryIntents: ['express_emotion'],
      understanding: 'correct',
      emotion: 'worried',
      barrier: 'time',
      selfEfficacy: 'moderate',
      readiness: 'considering',
      safetyFlag: 'none',
      currentTurnEvidence: {
        intent: 'what next',
        understanding: 'I understand',
        emotion: 'worried',
        barrier: 'not expressed',
        selfEfficacy: 'not expressed',
        readiness: 'not expressed',
        safetyFlag: 'not expressed',
      },
      refersToPreviousAssistantTurn: false,
      shortReplyType: 'not_short_reply',
      confidence: 0.8,
    },
    adaptiveState,
    adaptiveTransition: {
      previousUnderstanding: 'uncertain',
      currentUnderstanding: 'correct',
      understandingChanged: true,
      previousEmotion: 'uncertain',
      currentEmotion: 'worried',
      previousBarrier: 'none',
      currentBarrier: 'time',
      barrierCleared: false,
      previousSelfEfficacy: 'unknown',
      currentSelfEfficacy: 'moderate',
      previousReadiness: 'unclear',
      currentReadiness: 'considering',
      stateChanged: true,
      changedFields: ['understanding', 'emotion', 'barrier'],
      barrierUnmentionedTurns: 0,
    },
    resolvedShortReply: {
      isShortReply: false,
      shortReplyType: 'not_short_reply',
      requiresClarification: false,
    },
    decisionState,
    decisionTransition: {
      previousNeed: 'missing_information',
      currentNeed: 'unclear_options',
      previousStage: 'information_seeking',
      currentStage: 'option_clarification',
      previousSelectedOption: null,
      currentSelectedOption: 'portal message',
      selectedOptionPreserved: false,
      informationNeedResolvedThisTurn: true,
      decisionDeferredThisTurn: false,
      actionConfirmedThisTurn: false,
      draftAcceptedThisTurn: false,
      draftStatus: 'none',
      decisionNeedResolved: false,
      unnecessaryReconsiderationDetected: false,
      changedFields: ['primaryDecisionalNeed', 'selectedOption'],
      stateChanged: true,
    },
    dialogueStrategy: 'action_planning',
    theoryConstruct,
    decisionSupportStrategy: 'clarify_options',
    decisionSupportTheoryConstruct,
    dialogueTurnPlan: {
      primaryGoal: 'provide_practical_help',
      dialogueAct: 'plan_action',
      mustAddress: [],
      mustNotRepeat: [],
      mustNotAssume: [],
      alreadyResolved: [],
      shouldAskQuestion: true,
      nextPendingItem: NO_PENDING_ITEM,
    },
    conversationMemory: createDefaultConversationMemory(),
    previousConversationMemory: createDefaultConversationMemory(),
    decisionSupportTurnPlan: {
      primaryGoal: 'clarify_available_options',
      mustAddress: [],
      mustNotAssume: [],
      preserveSelectedOption: true,
      shouldAskQuestion: false,
    },
    requestInterpretation: {
      topic: 'decision_support',
      operation: 'provide_options',
      secondaryOperations: ['acknowledge'],
      primaryIntent: 'request_next_step',
      secondaryIntents: ['express_emotion'],
      explicitRequest: 'Provide neutral general next-step options.',
      entities: {},
      currentTurnEvidence: {
        topic: 'decision_support',
        operation: 'provide_options',
        explicitRequest: 'Provide neutral general next-step options.',
      },
      requiresMedicalEvidence: true,
      requiresCalculation: false,
      requiresConversationContext: true,
      requiresClarification: false,
      confidence: 0.8,
      classificationMode: 'local-fallback',
    },
    retrievalQuery: 'next step',
    retrievedEvidence: [],
    calculationResult: null,
    response: 'A general next step is to share the demonstration estimate with a healthcare professional.',
    usedEvidenceIds: ['nci-professional-interpretation-001'],
    initialGeneratedResponse: null,
    repairedResponse: null,
    operationValidation: {
      explicitRequestAddressed: true,
      primaryOperationCompleted: true,
      secondaryOperationsCompleted: true,
      requestedFormatUsed: true,
      directAnswerProvided: true,
      genericSubstitutionDetected: false,
      unsupportedMedicalClaimDetected: false,
      unnecessaryQuestionDetected: false,
      valid: true,
      missingElements: [],
      mustNotRepeat: [],
    },
    operationRepairAttempted: false,
    classificationMode: 'local-fallback',
    responseMode: 'local-rag-fallback',
    classificationConsistency: 'fallback',
    classificationRepairUsed: false,
    safetyOverrideApplied: false,
    repetitionDetected: false,
    regenerationUsed: false,
    fallbackUsed: true,
    similarityScore: 0,
    repeatedDialogueMove: null,
    dialogueAdvanced: true,
    primaryGoalSatisfied: true,
    decisionNeedAddressed: true,
    strategyRepeated: false,
    strategyProgressionApplied: false,
    unsupportedAssumptionDetected: false,
    resolvedIssueRepeated: false,
    directQuestionAnswered: true,
    practicalRequestFulfilled: true,
    userCorrectionHandled: true,
    repeatedExplanationDetected: false,
    shortReplyResolved: false,
    resolvedMeaning: null,
    orchestrationValidation: {
      primaryIntentAddressed: true,
      decisionalNeedAddressed: true,
      selectedOptionPreserved: true,
      resolvedIssueRepeated: false,
      unsupportedAssumptionDetected: false,
      medicalGroundingPassed: true,
      safetyPassed: true,
      dialogueProgressed: true,
      repetitionPassed: true,
      draftAccepted: false,
      decisionNeedResolved: false,
      dialogueAdvanced: true,
      unnecessaryReconsiderationDetected: false,
    },
    innovationMetadata: {
      adaptiveDimensionsUsed: [],
      decisionalNeedsAddressed: [],
      theoriesOperationalized: [],
      medicalEvidenceUsed: [],
      safetyControlsApplied: [],
      progressionControlsApplied: [],
      deliveryMode: 'text',
    },
    finalPrimaryIntent: 'request_next_step',
    secondaryIntents: ['express_emotion'],
    groqModel: 'test-model',
    recentStrategies: ['action_planning'],
    dialogueDesignSourceIds: [],
    ...overrides,
  };
}

describe('innovationMetadata', () => {
  it('records adaptive dimensions, decisional needs, theories, and text delivery', () => {
    const metadata = buildInnovationMetadata(baseResult());
    expect(metadata.adaptiveDimensionsUsed).toEqual(
      expect.arrayContaining(['intent', 'understanding', 'barrier', 'confidence']),
    );
    expect(metadata.decisionalNeedsAddressed).toEqual(
      expect.arrayContaining(['unclear_options', 'selected_option:portal message']),
    );
    expect(metadata.theoriesOperationalized.some((t) => /Fuzzy-Trace|Ottawa/i.test(t))).toBe(true);
    expect(metadata.medicalEvidenceUsed).toContain('nci-professional-interpretation-001');
    expect(metadata.deliveryMode).toBe('text');
    expect(metadata.progressionControlsApplied).toContain('local_grounded_fallback');
  });
});
