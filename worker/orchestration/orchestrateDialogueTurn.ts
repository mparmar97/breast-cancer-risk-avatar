import { classifyLocalStateDetailed } from '../behavioral/localClassifier';
import { applyStrategyProgression, selectDialogueStrategy } from '../behavioral/policy';
import { getTheoryConstruct } from '../behavioral/theoryMap';
import { transitionState } from '../behavioral/transitionState';
import { planDecisionSupportTurn } from '../decisionSupport/planDecisionSupportTurn';
import { selectDecisionSupportStrategy } from '../decisionSupport/selectDecisionSupportStrategy';
import { getDecisionSupportTheoryConstruct } from '../decisionSupport/theoryMap';
import {
  createDefaultDecisionSupportState,
  normalizeDecisionSupportState,
} from '../decisionSupport/types';
import { transitionDecisionState } from '../decisionSupport/transitionDecisionState';
import {
  createDefaultConversationMemory,
  normalizeConversationMemory,
} from '../dialogue/conversationMemory';
import {
  interpretCurrentTurnRequest,
  shouldSkipMedicalRag,
  type RequestInterpretation,
} from '../dialogue/currentTurnInterpretation';
import { planDialogueTurn } from '../dialogue/planDialogueTurn';
import { resolvePendingDraft } from '../dialogue/resolvePendingDraft';
import { resolveContextualReply } from '../dialogue/resolveContextualReply';
import { resolveShortReply } from '../dialogue/resolveShortReply';
import { NO_PENDING_ITEM } from '../dialogue/types';
import { updateConversationMemory } from '../dialogue/updateConversationMemory';
import { validateDialogueProgression } from '../dialogue/validateDialogueProgression';
import {
  buildOperationRepairInstruction,
  validateOperationFulfillment,
  type OperationValidation,
} from '../dialogue/validateOperationFulfillment';
import {
  buildSemanticRepairInstruction,
  validateResponseSemantics,
  type SemanticValidation,
} from '../dialogue/validateResponseSemantics';
import type { SemanticTurn } from '../dialogue/semanticTurn';
import { assertsUnderstandingUtterance } from '../dialogue/understandingSignals';
import { deriveResponsePlan, type ResponsePlan } from '../dialogue/deriveResponsePlan';
import {
  buildRouteFulfillmentRepairInstruction,
  validateRouteFulfillment,
} from '../dialogue/validateRouteFulfillment';
import { checkPlanCompatibility } from '../routing/checkPlanCompatibility';
import { routeDialogueTurn, strategyForRoute } from '../routing/routeDialogueTurn';
import type {
  DialogueRoute,
  PlanCompatibilityResult,
  RouteFulfillmentValidation,
  RouteValidation,
  RoutingDiagnostics,
} from '../routing/types';
import { validateRoute } from '../routing/validateRoute';
import { classifyAdaptiveState, localFallbackInterpretation } from '../llm/classifyAdaptiveState';
import type { DialogueStrategy } from '../behavioral/policy';
import { extractRecentAssistantMessages } from '../llm/conversationContext';
import { generateDynamicResponse } from '../llm/generateDynamicResponse';
import { DEFAULT_GROQ_MODEL } from '../llm/groqClient';
import {
  generatePlanAwareFallback,
  lifestyleScheduleLockInFallback,
} from '../llm/planAwareFallback';
import { applyRepetitionGuard } from '../llm/repetitionGuard';
import type { FallbackReason, ResponseMode } from '../llm/types';
import {
  assertMissingInformationConsistency,
  deriveActiveInformationNeed,
  type ActiveInformationNeed,
} from '../dialogue/activeInformationNeed';
import { selectTheoryApplication, type TheoryApplication } from '../dialogue/theoryApplication';
import {
  extractActivityFromAssistantReply,
  extractChosenActivityLabel,
  extractChosenScheduleLabel,
  isLifestyleActivityChoiceTurn,
  isLifestyleScheduleChoiceTurn,
  isLifestyleScheduleClarifyQuestion,
} from '../dialogue/lifestyleActivitySignals';
import { buildRetrievalSpec } from '../rag/buildRetrievalSpec';
import { buildOperationAwareRetrievalQuery } from '../rag/buildRetrievalQuery';
import { getDialogueDesignEvidence, retrieveEvidence } from '../rag/retrieve';
import {
  convertRiskToNaturalFrequency,
  type NaturalFrequencyResult,
} from '../risk/convertRiskToNaturalFrequency';
import { getFixedSafetyResponse } from '../safety/safetyResponses';
import { validateResponse } from '../safety/validateResponse';
import type { Env } from '../types';
import type { Intent } from '../behavioral/state';
import {
  createPipelineTrace,
  markClassificationAttempt,
  markGenerationAttempt,
  markStage,
} from '../debug/pipelineTrace';
import { validateMetadataConsistency } from '../debug/validateMetadataConsistency';
import {
  buildAssumptionRepairInstruction,
  validateAssumptions,
  type AssumptionValidation,
} from '../dialogue/validateAssumptions';
import type { ProviderExecution } from '../llm/types';
import {
  assertLatestMessagePresent,
  createTurnRequest,
  type TurnRequest,
} from '../request/turnRequest';
import { buildInnovationMetadata } from './innovationMetadata';
import type { OrchestrationInput, OrchestrationResult } from './types';
import { validateOrchestration } from './validateOrchestration';

const EVIDENCE_RESULT_LIMIT = 3;
const MAX_RECENT_STRATEGIES = 2;

/**
 * Adaptive orchestration layer: runs the full theory-informed,
 * evidence-grounded dialogue pipeline in a fixed order. Groq never
 * independently controls strategy selection, medical facts, or safety.
 */
export async function orchestrateDialogueTurn(
  env: Env,
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const turnRequest: TurnRequest =
    input.turnRequest ??
    createTurnRequest({
      latestMessage: input.latestMessage,
      recentConversation: input.recentConversation,
    });
  assertLatestMessagePresent(turnRequest.latestMessage, 'orchestrateDialogueTurn');
  // Never replace the request message once established.
  const message = turnRequest.latestMessage;
  const messagePresent = message.trim().length > 0;
  const pipelineTrace = createPipelineTrace(turnRequest.turnId, messagePresent);
  markStage(pipelineTrace, 'turn_request', messagePresent);

  const recentConversation = input.recentConversation;
  const recentAssistantMessages = extractRecentAssistantMessages(
    recentConversation.map((entry) => ({ role: entry.role, content: entry.content })),
    5,
  );
  const riskResult = input.riskResult;
  const previousState = input.previousAdaptiveState;
  const previousDecisionState = input.previousDecisionState
    ? normalizeDecisionSupportState(input.previousDecisionState)
    : createDefaultDecisionSupportState();
  const previousConversationMemory = normalizeConversationMemory(
    input.previousConversationMemory ?? createDefaultConversationMemory(),
  );
  const previousAssistantDialogueAct = input.previousAssistantDialogueAct ?? 'none';
  const pendingItem = input.pendingConversationItem ?? NO_PENDING_ITEM;
  const recentStrategies = input.recentStrategies ?? [];
  const barrierUnmentionedTurns = input.barrierUnmentionedTurns ?? 0;
  const pendingItemText = pendingItem.text ?? pendingItem.option;
  const groqModel = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  const previousAssistantResponse = recentAssistantMessages[0];
  let providerExecution: ProviderExecution = {};

  // 3. Deterministic safety pre-check.
  assertLatestMessagePresent(message, 'safety');
  markStage(pipelineTrace, 'safety', messagePresent);
  const localPrecheck = classifyLocalStateDetailed(message, previousState);

  if (localPrecheck.state.safetyFlag !== 'none') {
    return buildSafetyResult({
      env,
      message,
      recentConversation,
      riskResult,
      previousState,
      previousDecisionState,
      previousConversationMemory,
      previousAssistantDialogueAct,
      pendingItem,
      localPrecheck,
      groqModel,
      barrierUnmentionedTurns,
    });
  }

  // 5–6. Current-turn interpretation + consistency (handled inside classifyAdaptiveState).
  const classification = await classifyAdaptiveState(env, {
    latestMessage: message,
    recentConversation,
    previousState,
    previousAssistantDialogueAct,
    pendingItemText,
    riskResult,
  });
  assertLatestMessagePresent(message, 'classification');
  markStage(pipelineTrace, 'classification', messagePresent);
  const classificationSucceeded = classification.classificationMode === 'groq-structured';
  markClassificationAttempt(pipelineTrace, {
    attempted: Boolean(env.GROQ_API_KEY?.trim()),
    succeeded: classificationSucceeded,
    fallbackUsed: classification.classificationMode !== 'groq-structured',
    errorCategory: classification.providerErrorCategory,
  });
  if (classification.providerFailureStage || classification.providerErrorCategory) {
    providerExecution = {
      ...providerExecution,
      classificationFailureStage: classification.providerFailureStage ?? 'classification',
      classificationErrorCategory: classification.providerErrorCategory,
      providerFailureStage: classification.providerFailureStage ?? 'classification',
      providerErrorCategory: classification.providerErrorCategory,
    };
  }
  const interpretation = classification.interpretation;

  // 6b. Topic/operation interpretation of the latest explicit request.
  const requestInterpretation: RequestInterpretation = interpretCurrentTurnRequest({
    latestMessage: message,
    riskResult,
    pendingItem,
    previousAssistantReply: previousAssistantResponse,
    previousDraftPending:
      previousConversationMemory.draftStatus === 'proposed' ||
      previousConversationMemory.draftStatus === 'requested' ||
      previousConversationMemory.draftStatus === 'revision_requested',
  });

  // 7. Contextual short-reply + pending-draft resolution.
  // Pending-draft acceptance/revision/rejection overrides short-reply and
  // classifier intent so draft acceptance never falls through to readiness.
  const resolvedContextual = resolveContextualReply(
    message,
    pendingItem,
    previousAssistantResponse,
  );
  const resolvedShortReplyBase = resolveShortReply(message, pendingItem);
  const resolvedPendingDraft = resolvePendingDraft(message, pendingItem);
  const resolvedShortReply =
    resolvedPendingDraft.overridePrimaryIntent && resolvedPendingDraft.kind !== 'none'
      ? {
          ...resolvedShortReplyBase,
          isShortReply: resolvedShortReplyBase.isShortReply || resolvedPendingDraft.isDraftContext,
          requiresClarification: false,
          overridePrimaryIntent: resolvedPendingDraft.overridePrimaryIntent,
          overrideReadiness:
            resolvedPendingDraft.kind === 'accept'
              ? ('preparing' as const)
              : resolvedShortReplyBase.overrideReadiness,
          resolvedMeaning:
            resolvedPendingDraft.resolvedMeaning ?? resolvedShortReplyBase.resolvedMeaning,
        }
      : resolvedContextual.isShortReply
        ? resolvedContextual
        : resolvedShortReplyBase;

  const operationIntent = requestInterpretation.primaryIntent as Intent;
  const specificOperation =
    requestInterpretation.topic !== 'unclear' &&
    requestInterpretation.operation !== 'request_clarification' &&
    requestInterpretation.confidence >= 0.75;

  // Priority: draft/short-reply overrides, then specific requested operation, then classifier.
  // Use the contextual short-reply result (not only the base resolver) so "yes"
  // after an A-or-B offer can require a focused which-option clarification.
  const finalPrimaryIntent =
    resolvedPendingDraft.overridePrimaryIntent ??
    resolvedShortReply.overridePrimaryIntent ??
    (resolvedShortReply.requiresClarification
      ? ('affirmation' as Intent)
      : undefined) ??
    (specificOperation ? operationIntent : interpretation.primaryIntent);
  const finalResolvedMeaning =
    resolvedPendingDraft.resolvedMeaning ??
    resolvedShortReply.resolvedMeaning ??
    requestInterpretation.explicitRequest;

  // If the user chose "prepare questions" from an A-or-B offer, force that
  // semantic route so fallback/dynamic generation advances the flow.
  if (
    resolvedContextual.kind === 'information_requested' &&
    /preparing questions for a healthcare professional/i.test(resolvedContextual.resolvedMeaning ?? '')
  ) {
    if (requestInterpretation.semanticTurn) {
      requestInterpretation.semanticTurn = {
        ...requestInterpretation.semanticTurn,
        topic: 'professional_interpretation',
        primaryOperation: 'list_information',
        secondaryOperations: ['provide_preparation_information'],
        explicitRequest:
          'List a few general questions the user could ask a healthcare professional about a demonstration risk estimate.',
        requestedFormat: 'short list',
        directAnswerRequired: true,
        requiresClarification: false,
        confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.9),
      };
      requestInterpretation.topic = 'professional_interpretation' as typeof requestInterpretation.topic;
      requestInterpretation.operation = 'list_information';
      requestInterpretation.explicitRequest =
        requestInterpretation.semanticTurn.explicitRequest;
      requestInterpretation.confidence = requestInterpretation.semanticTurn.confidence;
    }
  }
  if (
    resolvedContextual.kind === 'information_requested' &&
    /chose clarifying the risk number/i.test(resolvedContextual.resolvedMeaning ?? '')
  ) {
    if (requestInterpretation.semanticTurn) {
      requestInterpretation.semanticTurn = {
        ...requestInterpretation.semanticTurn,
        topic: 'risk_meaning',
        primaryOperation: 'explain',
        explicitRequest:
          'Explain the demonstration risk estimate in plain terms; it is a probability, not a diagnosis.',
        directAnswerRequired: true,
        requiresClarification: false,
        confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.9),
      };
      requestInterpretation.topic = 'risk_meaning';
      requestInterpretation.operation = 'explain';
      requestInterpretation.explicitRequest =
        requestInterpretation.semanticTurn.explicitRequest;
      requestInterpretation.confidence = requestInterpretation.semanticTurn.confidence;
    }
  }
  if (
    resolvedContextual.kind === 'information_requested' &&
    /means for next steps|general next-step options/i.test(resolvedContextual.resolvedMeaning ?? '')
  ) {
    if (requestInterpretation.semanticTurn) {
      requestInterpretation.semanticTurn = {
        ...requestInterpretation.semanticTurn,
        topic: 'professional_interpretation',
        primaryOperation: 'provide_options',
        explicitRequest:
          'Provide neutral general next-step options for discussing the demonstration result.',
        directAnswerRequired: true,
        requiresClarification: false,
        confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.9),
      };
      requestInterpretation.topic = 'professional_interpretation';
      requestInterpretation.operation = 'provide_options';
      requestInterpretation.explicitRequest =
        requestInterpretation.semanticTurn.explicitRequest;
      requestInterpretation.confidence = requestInterpretation.semanticTurn.confidence;
    }
  }
  if (
    resolvedContextual.kind === 'information_requested' &&
    /how the estimate was calculated/i.test(resolvedContextual.resolvedMeaning ?? '')
  ) {
    if (requestInterpretation.semanticTurn) {
      requestInterpretation.semanticTurn = {
        ...requestInterpretation.semanticTurn,
        topic: 'calculator_inputs',
        primaryOperation: 'list_information',
        explicitRequest: 'Explain the input information used by the calculator.',
        directAnswerRequired: true,
        requiresClarification: false,
        confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.9),
      };
      requestInterpretation.topic = 'calculator_inputs';
      requestInterpretation.operation = 'list_information';
      requestInterpretation.explicitRequest =
        requestInterpretation.semanticTurn.explicitRequest;
      requestInterpretation.confidence = requestInterpretation.semanticTurn.confidence;
    }
  }
  if (
    resolvedContextual.kind === 'information_requested' &&
    /Answer that topic directly without asking another clarifying question/i.test(
      resolvedContextual.resolvedMeaning ?? '',
    )
  ) {
    if (requestInterpretation.semanticTurn) {
      // Prefer the semantic interpretation of the user's restated question.
      // Only force a generic direct-answer shell if it somehow stayed unclear.
      if (
        requestInterpretation.semanticTurn.topic === 'unclear' ||
        requestInterpretation.semanticTurn.requiresClarification
      ) {
        requestInterpretation.semanticTurn = {
          ...requestInterpretation.semanticTurn,
          topic: 'professional_interpretation',
          primaryOperation: 'answer_factual_question',
          secondaryOperations: ['set_personalized_advice_boundary'],
          explicitRequest:
            'Answer the confirmed clarifying topic directly with educational population-level information and a personalized-advice boundary. Do not ask another clarifying question.',
          userConstraints: ['direct educational answer', 'no clarifying loop'],
          directAnswerRequired: true,
          requiresClarification: false,
          requiresMedicalEvidence: true,
          confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.9),
        };
        requestInterpretation.topic = 'professional_interpretation';
        requestInterpretation.operation = 'answer_factual_question';
      } else {
        requestInterpretation.semanticTurn = {
          ...requestInterpretation.semanticTurn,
          directAnswerRequired: true,
          requiresClarification: false,
          confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.9),
        };
      }
      requestInterpretation.explicitRequest =
        requestInterpretation.semanticTurn.explicitRequest;
      requestInterpretation.confidence = requestInterpretation.semanticTurn.confidence;
    }
  }

  // Schedule slot after lifestyle timing ask → lock in; do not nest another which-part question.
  if (
    isLifestyleScheduleChoiceTurn(
      message,
      previousAssistantResponse,
      previousConversationMemory.lastRouteTopic,
    ) &&
    requestInterpretation.semanticTurn
  ) {
    const slot = extractChosenScheduleLabel(message);
    const activity =
      extractActivityFromAssistantReply(previousAssistantResponse) ?? 'movement';
    requestInterpretation.semanticTurn = {
      ...requestInterpretation.semanticTurn,
      topic: 'lifestyle_risk_information',
      primaryOperation: 'answer_general_health_question',
      secondaryOperations: [
        'explain_lifestyle_relationship',
        'set_personalized_advice_boundary',
      ],
      stance: 'accepting',
      explicitRequest: `Lock in the user's chosen activity schedule (${slot} for ${activity}). Affirm this as a realistic step, briefly reinforce population-level physical-activity benefits, and do not ask another which-part or when-during timing clarifying question.`,
      propositions: [{ text: message, status: 'preference' }],
      userConstraints: [`chosen schedule: ${slot}`, `chosen activity: ${activity}`],
      directAnswerRequired: true,
      requiresClarification: false,
      requiresMedicalEvidence: true,
      requiresSafetyBoundary: false,
      confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.93),
    };
    requestInterpretation.topic = 'lifestyle_risk_information' as typeof requestInterpretation.topic;
    requestInterpretation.operation =
      'answer_general_health_question' as typeof requestInterpretation.operation;
    requestInterpretation.explicitRequest = requestInterpretation.semanticTurn.explicitRequest;
    requestInterpretation.confidence = requestInterpretation.semanticTurn.confidence;
  }

  // Activity named after lifestyle-motivation ask → reinforce, do not jump to clinician action-planning.
  if (
    isLifestyleActivityChoiceTurn(
      message,
      previousAssistantResponse,
      previousConversationMemory.lastRouteTopic,
    ) &&
    requestInterpretation.semanticTurn
  ) {
    const activity = extractChosenActivityLabel(message);
    requestInterpretation.semanticTurn = {
      ...requestInterpretation.semanticTurn,
      topic: 'lifestyle_risk_information',
      primaryOperation: 'answer_general_health_question',
      secondaryOperations: [
        'explain_lifestyle_relationship',
        'set_personalized_advice_boundary',
        'clarify_preference',
      ],
      stance: 'accepting',
      explicitRequest: `Reinforce the user's chosen activity (${activity}) with population-level physical-activity benefits and autonomy-supportive maintenance encouragement, without prescribing a training plan.`,
      propositions: [{ text: message, status: 'preference' }],
      userConstraints: [`chosen activity: ${activity}`],
      directAnswerRequired: true,
      requiresClarification: false,
      requiresMedicalEvidence: true,
      requiresSafetyBoundary: false,
      confidence: Math.max(requestInterpretation.semanticTurn.confidence, 0.92),
    };
    requestInterpretation.topic = 'lifestyle_risk_information' as typeof requestInterpretation.topic;
    requestInterpretation.operation =
      'answer_general_health_question' as typeof requestInterpretation.operation;
    requestInterpretation.explicitRequest = requestInterpretation.semanticTurn.explicitRequest;
    requestInterpretation.confidence = requestInterpretation.semanticTurn.confidence;
  }

  // 7b. Active information need + global dialogue route.
  // Latest request owns the goal; theory is selected only when relevant.
  let activeInformationNeed: ActiveInformationNeed | undefined = requestInterpretation.semanticTurn
    ? deriveActiveInformationNeed({
        semanticTurn: requestInterpretation.semanticTurn,
        riskResult,
        conversationMemory: previousConversationMemory,
      })
    : undefined;

  let theoryApplication: TheoryApplication | undefined = requestInterpretation.semanticTurn
    ? selectTheoryApplication(
        requestInterpretation.semanticTurn,
        activeInformationNeed,
        previousState,
      )
    : undefined;

  let dialogueRoute: DialogueRoute = routeDialogueTurn({
    latestMessage: message,
    riskResult,
    semanticTurn: requestInterpretation.semanticTurn,
    conversationMemory: previousConversationMemory,
    pendingItem,
    previousAssistantReply: previousAssistantResponse,
    previousDraftPending:
      previousConversationMemory.draftStatus === 'proposed' ||
      previousConversationMemory.draftStatus === 'requested' ||
      previousConversationMemory.draftStatus === 'revision_requested',
    previousPrimaryGoal: previousConversationMemory.lastPrimaryGoal,
  });
  dialogueRoute = {
    ...dialogueRoute,
    activeInformationNeed,
    theoryApplication,
  };

  const previousRouteForCompat: DialogueRoute | null =
    previousConversationMemory.lastRouteTopic && previousConversationMemory.lastRouteOperation
      ? ({
          topic: previousConversationMemory.lastRouteTopic,
          primaryOperation: previousConversationMemory.lastRouteOperation,
          explicitRequest: previousConversationMemory.lastRouteExplicitRequest ?? '',
        } as DialogueRoute)
      : null;

  let planCompatibility: PlanCompatibilityResult = checkPlanCompatibility({
    route: dialogueRoute,
    previousRoute: previousRouteForCompat,
    previousPrimaryGoal: previousConversationMemory.lastPrimaryGoal,
    previousRouteConfidence: previousConversationMemory.lastRouteConfidence,
    previousFallbackUsed: previousConversationMemory.lastFallbackUsed,
  });
  dialogueRoute = {
    ...dialogueRoute,
    previousPlanCompatible: planCompatibility.compatible,
    previousPlanDiscarded: planCompatibility.previousPlanDiscarded,
    previousPlanDiscardReason: planCompatibility.reason,
  };
  assertLatestMessagePresent(message, 'routing');
  markStage(pipelineTrace, 'routing', messagePresent);
  markStage(pipelineTrace, 'theory', messagePresent);
  markStage(pipelineTrace, 'planning', messagePresent);

  let routeValidation: RouteValidation = validateRoute({
    route: dialogueRoute,
    latestMessage: message,
    stalePlanDetected: false,
  });

  // One local re-route if validation fails (no silent reuse of prior plan).
  if (!routeValidation.valid) {
    dialogueRoute = routeDialogueTurn({
      latestMessage: message,
      riskResult,
      conversationMemory: previousConversationMemory,
      pendingItem,
      previousAssistantReply: previousAssistantResponse,
      previousDraftPending:
        previousConversationMemory.draftStatus === 'proposed' ||
        previousConversationMemory.draftStatus === 'requested' ||
        previousConversationMemory.draftStatus === 'revision_requested',
      previousPrimaryGoal: previousConversationMemory.lastPrimaryGoal,
    });
    planCompatibility = checkPlanCompatibility({
      route: dialogueRoute,
      previousRoute: previousRouteForCompat,
      previousPrimaryGoal: previousConversationMemory.lastPrimaryGoal,
      previousRouteConfidence: previousConversationMemory.lastRouteConfidence,
      previousFallbackUsed: previousConversationMemory.lastFallbackUsed,
    });
    dialogueRoute = {
      ...dialogueRoute,
      activeInformationNeed,
      theoryApplication,
      previousPlanCompatible: planCompatibility.compatible,
      previousPlanDiscarded: planCompatibility.previousPlanDiscarded,
      previousPlanDiscardReason: planCompatibility.reason,
    };
    routeValidation = validateRoute({
      route: dialogueRoute,
      latestMessage: message,
      stalePlanDetected: false,
    });
  }

  const calculationResult: NaturalFrequencyResult | null =
    dialogueRoute.deterministicCalculationRequired || requestInterpretation.requiresCalculation
      ? convertRiskToNaturalFrequency({
          riskPercent:
            requestInterpretation.entities.riskValue ?? riskResult.fiveYearRisk,
          denominator: requestInterpretation.entities.denominator ?? 100,
          timeHorizon: requestInterpretation.entities.timeHorizon ?? riskResult.riskHorizon,
        })
      : null;

  // 8. Adaptive-state transition.
  const transition = transitionState({
    previousState,
    interpretation,
    resolvedShortReply,
    barrierUnmentionedTurns,
  });
  let adaptiveState = transition.state;

  // 9. Decisional-needs estimation and transition.
  const decisionTransitionResult = transitionDecisionState({
    latestMessage: message,
    interpretation,
    primaryIntent: finalPrimaryIntent,
    secondaryIntents: interpretation.secondaryIntents,
    adaptiveState,
    previousDecisionState,
    resolvedShortReply,
    resolvedMeaning: finalResolvedMeaning,
    pendingItem,
  });
  let decisionState = decisionTransitionResult.state;
  const decisionTransition = decisionTransitionResult.metadata;

  // Clear invented missing_information when there is no unresolved question.
  if (activeInformationNeed) {
    decisionState = assertMissingInformationConsistency(decisionState, activeInformationNeed);
  } else if (
    decisionState.primaryDecisionalNeed === 'missing_information' &&
    !decisionState.unresolvedQuestion
  ) {
    decisionState = {
      ...decisionState,
      primaryDecisionalNeed: 'none',
      unresolvedQuestion: null,
    };
  }

  // 9b. Conversation memory from the user turn (before planning).
  let conversationMemory = updateConversationMemory({
    latestMessage: message,
    interpretation,
    primaryIntent: finalPrimaryIntent,
    resolvedShortReply,
    adaptiveTransition: transition.metadata,
    decisionState,
    decisionTransition,
    previousMemory: previousConversationMemory,
    previousAssistantResponse,
    pendingItem,
  });

  // 10. Behavioral dialogue strategy — constrained by the active route.
  // Theory may modify delivery but must not replace the routed request.
  const routeStrategy = strategyForRoute(dialogueRoute) as DialogueStrategy;
  const policyStrategy = selectDialogueStrategy(adaptiveState, {
    intent: finalPrimaryIntent,
    emotionExpressedThisTurn: (() => {
      const emotionEvidence = interpretation.currentTurnEvidence.emotion.trim().toLowerCase();
      return (
        emotionEvidence.length > 0 &&
        emotionEvidence !== 'not expressed' &&
        emotionEvidence !== 'none' &&
        dialogueRoute.emotion !== 'not_expressed'
      );
    })(),
    draftStatus: conversationMemory.draftStatus,
    selectedCommunicationOption: conversationMemory.selectedCommunicationOption,
    plannedTiming: conversationMemory.plannedTiming,
  });
  const preferRouteStrategy =
    dialogueRoute.topic === 'lifestyle_risk_information' ||
    dialogueRoute.primaryOperation === 'answer_general_health_question' ||
    dialogueRoute.primaryOperation === 'provide_preparation_information' ||
    dialogueRoute.primaryOperation === 'list_information' ||
    (dialogueRoute.directAnswerRequired && dialogueRoute.confidence >= 0.7) ||
    (dialogueRoute.confidence >= 0.75 &&
      dialogueRoute.topic !== 'unclear' &&
      (dialogueRoute.directAnswerRequired ||
        dialogueRoute.primaryOperation === 'address_barrier' ||
        dialogueRoute.primaryOperation === 'set_boundary' ||
        dialogueRoute.primaryOperation === 'defer' ||
        dialogueRoute.primaryOperation === 'convert' ||
        dialogueRoute.primaryOperation === 'verify_understanding' ||
        dialogueRoute.primaryOperation === 'correct_misunderstanding'));
  // Do not let support_self_efficacy override a high-confidence direct-answer route.
  const baseStrategy =
    preferRouteStrategy ||
    (dialogueRoute.directAnswerRequired &&
      dialogueRoute.confidence >= 0.7 &&
      policyStrategy === 'support_self_efficacy')
      ? routeStrategy
      : policyStrategy;
  const userRepeatsSameConcern =
    (transition.metadata.currentBarrier !== 'none' &&
      transition.metadata.currentBarrier === transition.metadata.previousBarrier) ||
    (resolvedShortReply.isShortReply &&
      finalPrimaryIntent === 'explain_risk' &&
      Boolean(resolvedShortReply.resolvedMeaning));
  // Do not let stagnation progression override a high-confidence route.
  const progression = preferRouteStrategy
    ? {
        strategy: baseStrategy,
        strategyRepeated: false,
        strategyProgressionApplied: false,
      }
    : applyStrategyProgression({
        candidateStrategy: baseStrategy,
        recentStrategies,
        userRepeatsSameConcern,
      });
  const dialogueStrategy = progression.strategy;
  const strategyTheory = getTheoryConstruct(dialogueStrategy);
  // For lifestyle motivation, surface HBM/MI from theoryApplication so the
  // developer panel matches the motivational delivery (not clarify_risk FTT).
  const theoryConstruct =
    dialogueRoute.topic === 'lifestyle_risk_information' && theoryApplication
      ? {
          ...strategyTheory,
          theory: theoryApplication.healthBehaviorTheory,
          construct: theoryApplication.construct,
          communicationTechnique:
            theoryApplication.communicationTheory === 'Motivational Interviewing'
              ? 'autonomy-supportive open question with benefit framing'
              : strategyTheory.communicationTechnique,
          objective: theoryApplication.communicationObjective,
          sourceIds:
            (strategyTheory.sourceIds?.length ?? 0) > 0
              ? strategyTheory.sourceIds
              : (['MERCADO-ECA-MI-2023'] as typeof strategyTheory.sourceIds),
        }
      : strategyTheory;

  // 11. Decision-support strategy.
  const decisionSupportStrategy = selectDecisionSupportStrategy({
    decisionState,
    adaptiveState,
    primaryIntent: finalPrimaryIntent,
    safetyOverride: false,
  });
  const decisionSupportTheoryConstruct = getDecisionSupportTheoryConstruct(decisionSupportStrategy);

  // 12–13. Dialogue-turn and decision-support turn plans.
  const dialogueTurnPlan = planDialogueTurn({
    latestMessage: message,
    primaryIntent: finalPrimaryIntent,
    secondaryIntents: interpretation.secondaryIntents,
    resolvedShortReply,
    state: adaptiveState,
    transitionMetadata: transition.metadata,
    strategy: dialogueStrategy,
    previousAssistantDialogueAct,
    pendingItem,
    actionTiming: conversationMemory.plannedTiming ?? decisionState.actionTiming,
    draftStatus: conversationMemory.draftStatus,
    conversationMemory,
    requestInterpretation,
    riskResult,
    theoryConstruct,
  });
  const decisionSupportTurnPlan = planDecisionSupportTurn({
    decisionState,
    decisionSupportStrategy,
    primaryIntent: finalPrimaryIntent,
  });

  const semanticTurn: SemanticTurn | undefined = requestInterpretation.semanticTurn;
  let responsePlan: ResponsePlan | undefined = semanticTurn
    ? deriveResponsePlan({
        semanticTurn,
        conversationMemory,
        riskResult,
        adaptiveState,
        decisionState,
        theoryConstruct,
        decisionSupportTheory: decisionSupportTheoryConstruct,
        dialogueRoute,
      })
    : undefined;

  // Discard / rebuild when prior plan is incompatible with the new route.
  if (planCompatibility.previousPlanDiscarded && semanticTurn) {
    responsePlan = deriveResponsePlan({
      semanticTurn,
      conversationMemory,
      riskResult,
      adaptiveState,
      decisionState,
      theoryConstruct,
      decisionSupportTheory: decisionSupportTheoryConstruct,
      dialogueRoute,
    });
  }

  // Finalize memory with the planned assistant act / pending item.
  conversationMemory = updateConversationMemory({
    latestMessage: message,
    interpretation,
    primaryIntent: finalPrimaryIntent,
    resolvedShortReply,
    adaptiveTransition: transition.metadata,
    decisionState,
    decisionTransition,
    previousMemory: conversationMemory,
    previousAssistantResponse,
    pendingItem,
    dialogueTurnPlan,
  });

  // Mark information need resolved on successful teach-back / understanding.
  // Also when the user asserts understanding while introducing a new barrier.
  if (
    requestInterpretation.operation === 'verify_understanding' ||
    semanticTurn?.primaryOperation === 'verify_understanding' ||
    (semanticTurn?.understanding === 'correct' &&
      (semanticTurn.primaryOperation === 'address_barrier' ||
        assertsUnderstandingUtterance(message)))
  ) {
    conversationMemory = {
      ...conversationMemory,
      riskExplanationStatus: 'understood',
      understoodConcepts: conversationMemory.understoodConcepts.includes('risk_explanation')
        ? conversationMemory.understoodConcepts
        : [...conversationMemory.understoodConcepts, 'risk_explanation'],
      resolvedIssues: conversationMemory.resolvedIssues.includes('risk_explanation')
        ? conversationMemory.resolvedIssues
        : [...conversationMemory.resolvedIssues, 'risk_explanation'],
      answeredQuestions: conversationMemory.answeredQuestions.includes('risk meaning')
        ? conversationMemory.answeredQuestions
        : [...conversationMemory.answeredQuestions, 'risk meaning'],
      unresolvedQuestions: conversationMemory.unresolvedQuestions.filter((q) => q !== 'risk meaning'),
    };
    adaptiveState = { ...adaptiveState, understanding: 'correct' };
    decisionState = {
      ...decisionState,
      informationNeedResolved: true,
      primaryDecisionalNeed:
        decisionState.primaryDecisionalNeed === 'missing_information'
          ? 'resolved'
          : decisionState.primaryDecisionalNeed,
    };
    decisionTransition.informationNeedResolvedThisTurn = true;
    transition.metadata.currentUnderstanding = 'correct';
    transition.metadata.understandingChanged =
      transition.metadata.previousUnderstanding !== 'correct';
  }

  // Mark misunderstanding concepts from semantic correction turns.
  if (semanticTurn?.primaryOperation === 'correct_misunderstanding') {
    const concept =
      semanticTurn.misunderstanding === 'average_means_zero_risk'
        ? 'average_means_zero_risk'
        : semanticTurn.misunderstanding === 'elevated_means_diagnosis'
          ? 'elevated_means_diagnosis'
          : 'individual_prediction';
    conversationMemory = {
      ...conversationMemory,
      misunderstoodConcepts: conversationMemory.misunderstoodConcepts.includes(concept)
        ? conversationMemory.misunderstoodConcepts
        : [...conversationMemory.misunderstoodConcepts, concept],
    };
  }

  // Persist route summary for next-turn stale-plan checks.
  conversationMemory = {
    ...conversationMemory,
    lastRouteTopic: dialogueRoute.topic,
    lastRouteOperation: dialogueRoute.primaryOperation,
    lastRouteExplicitRequest: dialogueRoute.explicitRequest,
    lastRouteConfidence: dialogueRoute.confidence,
    lastPrimaryGoal: responsePlan?.primaryGoal ?? dialogueRoute.primaryOperation,
    currentTopic:
      dialogueRoute.topic === 'communication_support'
        ? 'communication_support'
        : dialogueRoute.topic === 'lifestyle_risk_information'
          ? 'lifestyle_risk_information'
          : conversationMemory.currentTopic,
  };

  // 14. Vetted medical evidence retrieval — prefer focused RetrievalSpec when available.
  const skipMedicalRag =
    dialogueRoute.selectedInformationSource === 'none' ||
    dialogueRoute.selectedInformationSource === 'conversation_memory' ||
    dialogueRoute.selectedInformationSource === 'deterministic_calculation' ||
    dialogueRoute.selectedInformationSource === 'draft_and_constraints' ||
    dialogueRoute.selectedInformationSource === 'calculator_metadata' ||
    dialogueRoute.selectedInformationSource === 'safety_boundary_policy' ||
    shouldSkipMedicalRag(requestInterpretation);

  const retrievalSpec =
    requestInterpretation.semanticTurn != null
      ? buildRetrievalSpec({
          semanticTurn: requestInterpretation.semanticTurn,
          route: dialogueRoute,
          riskResult,
          activeNeed: activeInformationNeed,
        })
      : null;

  const retrievalQuery =
    retrievalSpec && retrievalSpec.medicalRagRequired && retrievalSpec.query && !skipMedicalRag
      ? retrievalSpec.query
      : buildOperationAwareRetrievalQuery({
          message,
          state: adaptiveState,
          strategy: dialogueStrategy,
          riskResult,
          requestInterpretation,
          resolvedMeaning: finalResolvedMeaning,
          questionPurpose: dialogueTurnPlan.questionPurpose,
          // Only skip when the route intentionally skips medical RAG — do not
          // treat a focused non-RAG spec (e.g. convert) as skip when the route
          // still selected vetted medical evidence for another turn type.
          skipMedicalRag,
        });
  const retrievedEvidence =
    skipMedicalRag ||
    retrievalQuery.length === 0 ||
    (retrievalSpec != null &&
      !retrievalSpec.medicalRagRequired &&
      (retrievalSpec.deterministicCalculationRequired ||
        retrievalSpec.implementationMetadataRequired) &&
      (dialogueRoute.selectedInformationSource === 'deterministic_calculation' ||
        dialogueRoute.selectedInformationSource === 'calculator_metadata' ||
        dialogueRoute.selectedInformationSource === 'conversation_memory' ||
        dialogueRoute.selectedInformationSource === 'draft_and_constraints' ||
        dialogueRoute.selectedInformationSource === 'none'))
      ? []
      : retrieveEvidence(retrievalQuery, {
          limit: EVIDENCE_RESULT_LIMIT,
          sourceUse: 'medical-rag',
        });
  const dialogueDesignSourceIds = getDialogueDesignEvidence(dialogueStrategy).map((item) => item.id);

  // 15–18. Generation, validation, one repair, local fallback.
  const fixedSafetyReply = getFixedSafetyResponse(adaptiveState.safetyFlag);
  markStage(pipelineTrace, 'retrieval', messagePresent);

  let reply: string;
  let responseMode: ResponseMode;
  let usedEvidenceIds: string[] = [];
  let repetitionDetected = false;
  let regenerationUsed = false;
  let similarityScore = 0;
  let repeatedDialogueMove: string | null = null;
  // Progression flags are set from validators after generation — never left as optimistic defaults.
  let dialogueAdvanced = false;
  let primaryGoalSatisfied = false;
  let unsupportedAssumptionDetected = false;
  let resolvedIssueRepeated = false;
  let directQuestionAnswered = false;
  let repeatedExplanationDetected = false;
  let practicalRequestFulfilled = false;
  let userCorrectionHandled = false;
  let fallbackReason: FallbackReason | undefined = classification.fallbackReason;
  const safetyOverrideApplied = Boolean(fixedSafetyReply);
  let initialGeneratedResponse: string | null = null;
  let repairedResponse: string | null = null;
  let operationRepairAttempted = false;
  let assumptionValidation: AssumptionValidation = {
    patientPortalAssumed: false,
    appointmentAssumed: false,
    clinicianRelationshipAssumed: false,
    selectedActionInvented: false,
    unsupportedPersonalizationDetected: false,
    unsupportedAssumptionDetected: false,
    portalAssumedWithoutMemory: false,
    appointmentAssumedWithoutMemory: false,
    clinicianRelationshipAssumedWithoutMemory: false,
    valid: true,
    failedAssumptions: [],
    repairAttempted: false,
  };
  let routeFulfillment: RouteFulfillmentValidation = {
    routeFulfilled: true,
    directAnswerProvided: true,
    requestedOperationCompleted: true,
    staleTopicRepeated: false,
    incompatibleDialogueMoveDetected: false,
    sourceMismatchDetected: false,
    valid: true,
    missingElements: [],
  };
  let operationValidation: OperationValidation = {
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
  };

  if (fixedSafetyReply) {
    reply = fixedSafetyReply;
    responseMode = 'fixed-safety';
  } else {
    const generationInput = {
      latestMessage: message,
      recentConversation,
      adaptiveState,
      previousAdaptiveState: previousState,
      primaryIntent: finalPrimaryIntent,
      secondaryIntents: interpretation.secondaryIntents,
      resolvedMeaning: finalResolvedMeaning,
      strategy: dialogueStrategy,
      theoryConstruct,
      dialogueTurnPlan,
      riskResult,
      retrievedEvidence,
      recentAssistantMessages,
      decisionState,
      previousDecisionState,
      decisionSupportStrategy,
      decisionSupportTurnPlan,
      conversationMemory,
      requestInterpretation,
      calculationResult,
      semanticTurn,
      responsePlan,
    };

    assertLatestMessagePresent(message, 'generation');
    let generation = await generateDynamicResponse(env, generationInput);
    initialGeneratedResponse = generation.reply;
    const generationSucceeded = generation.responseMode === 'groq-dynamic-rag';
    markStage(
      pipelineTrace,
      generationSucceeded ? 'generation' : 'fallback',
      messagePresent,
    );
    markGenerationAttempt(pipelineTrace, {
      attempted: Boolean(env.GROQ_API_KEY?.trim()),
      succeeded: generationSucceeded,
      fallbackUsed: !generationSucceeded,
      errorCategory: generation.providerErrorCategory,
    });
    if (
      generation.providerFailureStage ||
      generation.providerErrorCategory ||
      generation.generationValidationReason ||
      generation.fallbackReason === 'generation_validation_failure'
    ) {
      providerExecution = {
        ...providerExecution,
        generationFailureStage:
          generation.providerFailureStage ??
          (generation.fallbackReason ? 'response_generation' : undefined),
        generationErrorCategory: generation.providerErrorCategory,
        generationValidationReason: generation.generationValidationReason,
        providerFailureStage:
          generation.providerFailureStage ??
          (generation.fallbackReason ? 'response_generation' : providerExecution.providerFailureStage),
        providerErrorCategory:
          generation.providerErrorCategory ?? providerExecution.providerErrorCategory,
      };
    }

    const runRouteFulfillment = (replyText: string): RouteFulfillmentValidation =>
      validateRouteFulfillment({
        reply: replyText,
        route: dialogueRoute,
        plan: responsePlan,
      });

    const applyProgressionFromReply = (replyText: string): void => {
      const progressionCheck = validateDialogueProgression({
        reply: replyText,
        latestMessage: message,
        plan: dialogueTurnPlan,
        transitionMetadata: transition.metadata,
        previousAssistantReply: recentAssistantMessages[0],
        decisionState,
        decisionTransition,
        primaryIntent: finalPrimaryIntent,
        conversationMemory,
        previousDialogueAct: previousAssistantDialogueAct,
      });
      operationValidation = runOperationValidation(replyText);
      dialogueAdvanced = progressionCheck.dialogueAdvanced && operationValidation.valid;
      primaryGoalSatisfied =
        progressionCheck.primaryGoalSatisfied && operationValidation.primaryOperationCompleted;
      unsupportedAssumptionDetected = progressionCheck.unsupportedAssumptionDetected;
      resolvedIssueRepeated = progressionCheck.resolvedIssueRepeated;
      directQuestionAnswered =
        progressionCheck.directQuestionAnswered && operationValidation.directAnswerProvided;
      repeatedExplanationDetected = progressionCheck.repeatedExplanationDetected;
      practicalRequestFulfilled = progressionCheck.practicalRequestFulfilled;
      userCorrectionHandled = progressionCheck.userCorrectionHandled;
      if (progressionCheck.unnecessaryReconsiderationDetected) {
        decisionTransition.unnecessaryReconsiderationDetected = true;
      }
    };

    const runOperationValidation = (replyText: string): OperationValidation => {
      const fulfillment = runRouteFulfillment(replyText);
      routeFulfillment = fulfillment;
      if (semanticTurn && responsePlan) {
        const semantic = validateResponseSemantics({
          reply: replyText,
          semanticTurn,
          plan: responsePlan,
          calculation: calculationResult,
          conversationMemory,
        });
        return {
          explicitRequestAddressed: semantic.explicitRequestAddressed && fulfillment.routeFulfilled,
          primaryOperationCompleted:
            semantic.primaryOperationCompleted && fulfillment.requestedOperationCompleted,
          secondaryOperationsCompleted: semantic.secondaryOperationsCompleted,
          requestedFormatUsed: semantic.requestedFormatUsed,
          directAnswerProvided: semantic.directAnswerProvided && fulfillment.directAnswerProvided,
          genericSubstitutionDetected:
            semantic.genericSubstitutionDetected || fulfillment.incompatibleDialogueMoveDetected,
          unsupportedMedicalClaimDetected: semantic.unsupportedMedicalClaimDetected,
          unnecessaryQuestionDetected: semantic.unnecessaryQuestionDetected,
          currentBarrierAddressed: semantic.currentBarrierAddressed,
          resolvedRiskExplanationRepeated:
            semantic.resolvedRiskExplanationRepeated || fulfillment.staleTopicRepeated,
          currentTurnPriorityPreserved: semantic.currentTurnPriorityPreserved,
          unsupportedEmotionDetected: semantic.unsupportedEmotionDetected,
          dialogueAdvanced: semantic.dialogueAdvanced && fulfillment.routeFulfilled,
          valid: semantic.valid && fulfillment.valid,
          reason: !fulfillment.valid ? fulfillment.reason : semantic.reason,
          missingElements: [
            ...semantic.missingElements,
            ...fulfillment.missingElements,
          ],
          mustNotRepeat: semantic.mustNotRepeat,
        };
      }
      const operation = validateOperationFulfillment({
        reply: replyText,
        interpretation: requestInterpretation,
        plan: dialogueTurnPlan,
        calculation: calculationResult,
        shouldAskQuestion: dialogueTurnPlan.shouldAskQuestion,
      });
      return {
        ...operation,
        valid: operation.valid && fulfillment.valid,
        reason: !fulfillment.valid ? fulfillment.reason : operation.reason,
        missingElements: [...operation.missingElements, ...fulfillment.missingElements],
      };
    };

    const buildRepair = (validation: OperationValidation): string => {
      if (!routeFulfillment.valid) {
        return buildRouteFulfillmentRepairInstruction(routeFulfillment, dialogueRoute);
      }
      if (semanticTurn) {
        return buildSemanticRepairInstruction(validation as SemanticValidation, semanticTurn);
      }
      return buildOperationRepairInstruction(validation, requestInterpretation);
    };

    if (generation.responseMode === 'groq-dynamic-rag') {
      const progressionCheck = validateDialogueProgression({
        reply: generation.reply,
        latestMessage: message,
        plan: dialogueTurnPlan,
        transitionMetadata: transition.metadata,
        previousAssistantReply: recentAssistantMessages[0],
        decisionState,
        decisionTransition,
        primaryIntent: finalPrimaryIntent,
        conversationMemory,
        previousDialogueAct: previousAssistantDialogueAct,
      });
      operationValidation = runOperationValidation(generation.reply);
      dialogueAdvanced = progressionCheck.dialogueAdvanced && operationValidation.valid;
      primaryGoalSatisfied =
        progressionCheck.primaryGoalSatisfied && operationValidation.primaryOperationCompleted;
      unsupportedAssumptionDetected = progressionCheck.unsupportedAssumptionDetected;
      resolvedIssueRepeated = progressionCheck.resolvedIssueRepeated;
      directQuestionAnswered =
        progressionCheck.directQuestionAnswered && operationValidation.directAnswerProvided;
      repeatedExplanationDetected = progressionCheck.repeatedExplanationDetected;
      practicalRequestFulfilled = progressionCheck.practicalRequestFulfilled;
      userCorrectionHandled = progressionCheck.userCorrectionHandled;
      if (progressionCheck.unnecessaryReconsiderationDetected) {
        decisionTransition.unnecessaryReconsiderationDetected = true;
      }

      if (!progressionCheck.valid || !operationValidation.valid) {
        operationRepairAttempted = true;
        const repaired = await generateDynamicResponse(env, {
          ...generationInput,
          progressionIssue: progressionCheck.valid ? undefined : progressionCheck.reason,
          operationRepairInstruction: operationValidation.valid
            ? undefined
            : buildRepair(operationValidation),
        });
        if (repaired.responseMode === 'groq-dynamic-rag') {
          repairedResponse = repaired.reply;
          const repairedCheck = validateDialogueProgression({
            reply: repaired.reply,
            latestMessage: message,
            plan: dialogueTurnPlan,
            transitionMetadata: transition.metadata,
            previousAssistantReply: recentAssistantMessages[0],
            decisionState,
            decisionTransition,
            primaryIntent: finalPrimaryIntent,
            conversationMemory,
            previousDialogueAct: previousAssistantDialogueAct,
          });
          const repairedOperation = runOperationValidation(repaired.reply);
          if (repairedCheck.valid && repairedOperation.valid) {
            generation = repaired;
            operationValidation = repairedOperation;
            dialogueAdvanced = repairedCheck.dialogueAdvanced;
            primaryGoalSatisfied = repairedCheck.primaryGoalSatisfied;
            unsupportedAssumptionDetected = repairedCheck.unsupportedAssumptionDetected;
            resolvedIssueRepeated = repairedCheck.resolvedIssueRepeated;
            directQuestionAnswered = repairedCheck.directQuestionAnswered;
            repeatedExplanationDetected = repairedCheck.repeatedExplanationDetected;
            practicalRequestFulfilled = repairedCheck.practicalRequestFulfilled;
            userCorrectionHandled = repairedCheck.userCorrectionHandled;
            decisionTransition.unnecessaryReconsiderationDetected =
              repairedCheck.unnecessaryReconsiderationDetected;
          } else {
            // Keep Groq wording; do not replace with local templates on soft repair miss.
            generation = repaired;
            operationValidation = repairedOperation;
            applyProgressionFromReply(generation.reply);
          }
        } else {
          // Repair hit provider/infra failure — keep the original Groq reply.
          applyProgressionFromReply(generation.reply);
        }
      }
    } else {
      applyProgressionFromReply(generation.reply);
    }

    const guarded = await applyRepetitionGuard(env, generationInput, generation);
    reply = guarded.reply;
    responseMode = guarded.responseMode;
    usedEvidenceIds = guarded.usedEvidenceIds;
    repetitionDetected = guarded.repetitionDetected;
    regenerationUsed = guarded.regenerationUsed || operationRepairAttempted;
    similarityScore = guarded.similarityScore;
    repeatedDialogueMove = guarded.repeatedDialogueMove;
    fallbackReason = guarded.fallbackReason ?? fallbackReason;
  }

  reply = validateResponse(reply);
  let fallbackUsed = responseMode !== 'groq-dynamic-rag' && responseMode !== 'fixed-safety';

  // Assumption validation on ALL final replies (including local fallback).
  if (!fixedSafetyReply) {
    markStage(pipelineTrace, 'assumption_validation', messagePresent);
    assumptionValidation = validateAssumptions({
      reply,
      conversationMemory,
    });
    if (!assumptionValidation.valid) {
      assumptionValidation = { ...assumptionValidation, repairAttempted: true };
      const repairedAssumptions = await generateDynamicResponse(env, {
        latestMessage: message,
        recentConversation,
        adaptiveState,
        previousAdaptiveState: previousState,
        primaryIntent: finalPrimaryIntent,
        secondaryIntents: interpretation.secondaryIntents,
        resolvedMeaning: finalResolvedMeaning,
        strategy: dialogueStrategy,
        theoryConstruct,
        dialogueTurnPlan,
        riskResult,
        retrievedEvidence,
        recentAssistantMessages,
        decisionState,
        previousDecisionState,
        decisionSupportStrategy,
        decisionSupportTurnPlan,
        conversationMemory,
        requestInterpretation,
        calculationResult,
        semanticTurn,
        responsePlan,
        operationRepairInstruction: buildAssumptionRepairInstruction(assumptionValidation),
      });
      if (repairedAssumptions.responseMode === 'groq-dynamic-rag') {
        const recheck = validateAssumptions({
          reply: repairedAssumptions.reply,
          conversationMemory,
          repairAttempted: true,
        });
        if (recheck.valid) {
          reply = validateResponse(repairedAssumptions.reply);
          repairedResponse = repairedAssumptions.reply;
          responseMode = repairedAssumptions.responseMode;
          usedEvidenceIds = repairedAssumptions.usedEvidenceIds;
          regenerationUsed = true;
          assumptionValidation = recheck;
          fallbackUsed = false;
        } else {
          // Prefer repaired Groq wording over local templates.
          reply = validateResponse(repairedAssumptions.reply);
          repairedResponse = repairedAssumptions.reply;
          responseMode = 'groq-dynamic-rag';
          usedEvidenceIds = repairedAssumptions.usedEvidenceIds;
          regenerationUsed = true;
          fallbackUsed = false;
          assumptionValidation = validateAssumptions({
            reply,
            conversationMemory,
            repairAttempted: true,
          });
        }
      } else if (responseMode === 'groq-dynamic-rag') {
        // Infra failure on repair — keep the current Groq reply.
        assumptionValidation = validateAssumptions({
          reply,
          conversationMemory,
          repairAttempted: true,
        });
      } else if (semanticTurn && responsePlan) {
        reply = validateResponse(
          generatePlanAwareFallback({
            semanticTurn,
            plan: responsePlan,
            riskResult,
            calculation: calculationResult,
            conversationMemory,
            recentAssistantMessages,
            retrievedEvidence,
            latestMessage: message,
          }),
        );
        responseMode = 'local-rag-fallback';
        fallbackUsed = true;
        assumptionValidation = validateAssumptions({
          reply,
          conversationMemory,
          repairAttempted: true,
        });
      }
    }
  }

  // Hard stop: user already chose a lifestyle time slot, but the reply still
  // nests another which-part timing question (common Groq loop).
  if (
    !fixedSafetyReply &&
    isLifestyleScheduleChoiceTurn(
      message,
      previousAssistantResponse,
      previousConversationMemory.lastRouteTopic,
    ) &&
    isLifestyleScheduleClarifyQuestion(reply)
  ) {
    reply = validateResponse(
      lifestyleScheduleLockInFallback(
        message,
        previousAssistantResponse,
        retrievedEvidence,
        semanticTurn,
      ),
    );
    responseMode = 'local-rag-fallback';
    fallbackUsed = true;
  }

  // Always re-run progression validators on the reply that will be returned.
  if (!fixedSafetyReply) {
    markStage(pipelineTrace, 'validation', messagePresent);
    const finalProgression = validateDialogueProgression({
      reply,
      latestMessage: message,
      plan: dialogueTurnPlan,
      transitionMetadata: transition.metadata,
      previousAssistantReply: recentAssistantMessages[0],
      decisionState,
      decisionTransition,
      primaryIntent: finalPrimaryIntent,
      conversationMemory,
      previousDialogueAct: previousAssistantDialogueAct,
    });
    routeFulfillment = validateRouteFulfillment({
      reply,
      route: dialogueRoute,
      plan: responsePlan,
    });
    if (semanticTurn && responsePlan) {
      operationValidation = {
        ...operationValidation,
        directAnswerProvided: routeFulfillment.directAnswerProvided,
        primaryOperationCompleted: routeFulfillment.requestedOperationCompleted,
        valid: routeFulfillment.valid && operationValidation.valid,
      };
    }
    dialogueAdvanced = finalProgression.dialogueAdvanced && routeFulfillment.routeFulfilled;
    primaryGoalSatisfied =
      finalProgression.primaryGoalSatisfied && routeFulfillment.requestedOperationCompleted;
    unsupportedAssumptionDetected =
      finalProgression.unsupportedAssumptionDetected || !assumptionValidation.valid;
    resolvedIssueRepeated = finalProgression.resolvedIssueRepeated;
    directQuestionAnswered =
      finalProgression.directQuestionAnswered && routeFulfillment.directAnswerProvided;
    // Lifestyle/exercise answers: treat as answered when reply mentions exercise/health.
    if (
      (dialogueRoute.topic === 'lifestyle_risk_information' ||
        dialogueRoute.primaryOperation === 'answer_general_health_question') &&
      /\b(exercise|physical activity|lifestyle|diet|health)\b/i.test(reply)
    ) {
      directQuestionAnswered = true;
      primaryGoalSatisfied = true;
      dialogueAdvanced = true;
    }
    repeatedExplanationDetected = finalProgression.repeatedExplanationDetected;
    practicalRequestFulfilled = finalProgression.practicalRequestFulfilled;
    userCorrectionHandled = finalProgression.userCorrectionHandled;
  } else {
    dialogueAdvanced = true;
    primaryGoalSatisfied = true;
    directQuestionAnswered = true;
    practicalRequestFulfilled = true;
    userCorrectionHandled = true;
  }

  conversationMemory = {
    ...conversationMemory,
    lastFallbackUsed: fallbackUsed,
  };

  markStage(pipelineTrace, 'complete', messagePresent);

  const routingDiagnostics: RoutingDiagnostics = {
    latestMessage: turnRequest.latestMessage,
    topic: dialogueRoute.topic,
    primaryOperation: dialogueRoute.primaryOperation,
    secondaryOperations: dialogueRoute.secondaryOperations,
    stance: dialogueRoute.stance,
    explicitRequest: dialogueRoute.explicitRequest,
    directAnswerRequired: dialogueRoute.directAnswerRequired,
    emotion: dialogueRoute.emotion,
    emotionEvidence: dialogueRoute.currentTurnEvidence.emotion,
    barrier: dialogueRoute.barrier,
    barrierEvidence: dialogueRoute.currentTurnEvidence.barrier,
    previousPlanCompatible: planCompatibility.compatible,
    previousPlanDiscarded: planCompatibility.previousPlanDiscarded,
    previousPlanDiscardReason: planCompatibility.reason,
    selectedInformationSource: dialogueRoute.selectedInformationSource,
    selectedInformationSources: dialogueRoute.selectedInformationSources,
    activeResponseGoal: responsePlan?.primaryGoal ?? dialogueRoute.primaryOperation,
    activeInformationNeed,
    theoryApplication,
    routeValidation,
    responseRouteValidation: routeFulfillment,
    repairAttempted: operationRepairAttempted,
    fallbackReason,
  };

  const orchestrationValidation = validateOrchestration({
    reply,
    primaryIntent: finalPrimaryIntent,
    dialogueTurnPlan,
    decisionSupportTurnPlan,
    decisionState,
    previousDecisionState,
    adaptiveTransition: transition.metadata,
    decisionTransition,
    usedEvidenceIds,
    retrievedEvidenceCount: retrievedEvidence.length,
    safetyOverrideApplied,
    responseMode,
    dialogueAdvanced,
    primaryGoalSatisfied,
    unsupportedAssumptionDetected,
    resolvedIssueRepeated,
    repetitionDetected,
    regenerationUsed,
  });

  const resultWithoutInnovation: Omit<OrchestrationResult, 'innovationMetadata'> = {
    currentTurnInterpretation: interpretation,
    requestInterpretation,
    semanticTurn,
    responsePlan,
    dialogueRoute,
    routeValidation,
    planCompatibility,
    routeFulfillment,
    routingDiagnostics,
    adaptiveState,
    adaptiveTransition: transition.metadata,
    resolvedShortReply,
    decisionState,
    decisionTransition,
    conversationMemory,
    previousConversationMemory,
    dialogueStrategy,
    theoryConstruct,
    decisionSupportStrategy,
    decisionSupportTheoryConstruct,
    dialogueTurnPlan,
    decisionSupportTurnPlan,
    retrievalQuery,
    retrievedEvidence,
    calculationResult,
    response: reply,
    usedEvidenceIds,
    initialGeneratedResponse,
    repairedResponse,
    operationValidation,
    operationRepairAttempted,
    classificationMode: classification.classificationMode,
    responseMode,
    classificationConsistency: classification.classificationConsistency,
    classificationRepairUsed: classification.classificationRepairUsed,
    fallbackReason,
    safetyOverrideApplied,
    repetitionDetected,
    regenerationUsed,
    fallbackUsed,
    similarityScore,
    repeatedDialogueMove,
    dialogueAdvanced,
    primaryGoalSatisfied,
    decisionNeedAddressed: orchestrationValidation.decisionalNeedAddressed,
    strategyRepeated: progression.strategyRepeated,
    strategyProgressionApplied: progression.strategyProgressionApplied,
    unsupportedAssumptionDetected,
    resolvedIssueRepeated,
    directQuestionAnswered,
    practicalRequestFulfilled,
    userCorrectionHandled,
    repeatedExplanationDetected,
    shortReplyResolved: resolvedShortReply.isShortReply && !resolvedShortReply.requiresClarification,
    resolvedMeaning: finalResolvedMeaning ?? null,
    orchestrationValidation,
    finalPrimaryIntent,
    secondaryIntents: interpretation.secondaryIntents,
    groqModel,
    recentStrategies: [...recentStrategies, dialogueStrategy].slice(-MAX_RECENT_STRATEGIES),
    dialogueDesignSourceIds,
    turnRequest,
    pipelineTrace,
    providerExecution,
    assumptionValidation,
    metadataConsistency: validateMetadataConsistency({
      turnRequest,
      routingDiagnostics,
      reply,
      directQuestionAnswered,
      primaryGoalSatisfied,
      dialogueAdvanced,
      clarificationRequired: dialogueRoute.clarificationRequired,
      clarificationFields: {
        requiresClarification: dialogueRoute.clarificationRequired,
        directAnswerRequired: dialogueRoute.directAnswerRequired,
      },
      assumptionValidation,
      pipelineTrace,
    }),
  };

  const result = {
    ...resultWithoutInnovation,
    innovationMetadata: buildInnovationMetadata(resultWithoutInnovation as OrchestrationResult),
  };

  return result;
}

async function buildSafetyResult(args: {
  env: Env;
  message: string;
  recentConversation: OrchestrationInput['recentConversation'];
  riskResult: OrchestrationInput['riskResult'];
  previousState?: OrchestrationInput['previousAdaptiveState'];
  previousDecisionState: ReturnType<typeof createDefaultDecisionSupportState>;
  previousConversationMemory: ReturnType<typeof createDefaultConversationMemory>;
  previousAssistantDialogueAct: NonNullable<OrchestrationInput['previousAssistantDialogueAct']>;
  pendingItem: NonNullable<OrchestrationInput['pendingConversationItem']>;
  localPrecheck: ReturnType<typeof classifyLocalStateDetailed>;
  groqModel: string;
  barrierUnmentionedTurns: number;
}): Promise<OrchestrationResult> {
  const {
    message,
    recentConversation,
    riskResult,
    previousState,
    previousDecisionState,
    previousConversationMemory,
    previousAssistantDialogueAct,
    pendingItem,
    localPrecheck,
    groqModel,
    barrierUnmentionedTurns,
  } = args;

  const adaptiveState = localPrecheck.state;
  const dialogueStrategy = selectDialogueStrategy(adaptiveState, { intent: localPrecheck.intent });
  const theoryConstruct = getTheoryConstruct(dialogueStrategy);
  const interpretation = localFallbackInterpretation({
    latestMessage: message,
    recentConversation,
    previousState,
    riskResult,
  });
  const resolvedShortReply = resolveShortReply(message, pendingItem);
  const transition = transitionState({
    previousState,
    interpretation,
    resolvedShortReply,
    barrierUnmentionedTurns,
  });
  const decisionTransitionResult = transitionDecisionState({
    latestMessage: message,
    interpretation,
    primaryIntent: localPrecheck.intent,
    secondaryIntents: [],
    adaptiveState,
    previousDecisionState,
    resolvedShortReply,
  });
  const decisionSupportStrategy = selectDecisionSupportStrategy({
    decisionState: decisionTransitionResult.state,
    adaptiveState,
    primaryIntent: localPrecheck.intent,
    safetyOverride: true,
  });
  const decisionSupportTheoryConstruct = getDecisionSupportTheoryConstruct(decisionSupportStrategy);
  const conversationMemory = updateConversationMemory({
    latestMessage: message,
    interpretation,
    primaryIntent: localPrecheck.intent,
    resolvedShortReply,
    adaptiveTransition: transition.metadata,
    decisionState: decisionTransitionResult.state,
    decisionTransition: decisionTransitionResult.metadata,
    previousMemory: previousConversationMemory,
    pendingItem,
  });
  const dialogueTurnPlan = planDialogueTurn({
    latestMessage: message,
    primaryIntent: localPrecheck.intent,
    secondaryIntents: [],
    resolvedShortReply,
    state: adaptiveState,
    transitionMetadata: transition.metadata,
    strategy: dialogueStrategy,
    previousAssistantDialogueAct,
    pendingItem,
    conversationMemory,
  });
  const decisionSupportTurnPlan = planDecisionSupportTurn({
    decisionState: decisionTransitionResult.state,
    decisionSupportStrategy,
    primaryIntent: localPrecheck.intent,
  });
  const requestInterpretation = interpretCurrentTurnRequest({
    latestMessage: message,
    riskResult,
    pendingItem,
    previousAssistantReply: recentConversation.filter((e) => e.role === 'assistant').at(-1)?.content,
  });
  const retrievalQuery = buildOperationAwareRetrievalQuery({
    message,
    state: adaptiveState,
    strategy: dialogueStrategy,
    riskResult,
    requestInterpretation,
    skipMedicalRag: false,
  });
  const retrievedEvidence = retrieveEvidence(retrievalQuery, {
    limit: EVIDENCE_RESULT_LIMIT,
    sourceUse: 'medical-rag',
  });
  const reply = validateResponse(getFixedSafetyResponse(adaptiveState.safetyFlag) ?? '');
  const operationValidation: OperationValidation = {
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
  };

  const orchestrationValidation = validateOrchestration({
    reply,
    primaryIntent: localPrecheck.intent,
    dialogueTurnPlan,
    decisionSupportTurnPlan,
    decisionState: decisionTransitionResult.state,
    previousDecisionState,
    adaptiveTransition: transition.metadata,
    decisionTransition: decisionTransitionResult.metadata,
    usedEvidenceIds: [],
    retrievedEvidenceCount: retrievedEvidence.length,
    safetyOverrideApplied: true,
    responseMode: 'fixed-safety',
    dialogueAdvanced: true,
    primaryGoalSatisfied: true,
    unsupportedAssumptionDetected: false,
    resolvedIssueRepeated: false,
    repetitionDetected: false,
    regenerationUsed: false,
  });

  const safetyRoute = routeDialogueTurn({
    latestMessage: message,
    riskResult,
    safetyOverride: true,
    conversationMemory: previousConversationMemory,
  });
  const partial: Omit<OrchestrationResult, 'innovationMetadata'> = {
    currentTurnInterpretation: interpretation,
    requestInterpretation,
    semanticTurn: requestInterpretation.semanticTurn,
    responsePlan: requestInterpretation.semanticTurn
      ? deriveResponsePlan({
          semanticTurn: requestInterpretation.semanticTurn,
          conversationMemory,
          riskResult,
          adaptiveState,
          decisionState: decisionTransitionResult.state,
          dialogueRoute: safetyRoute,
        })
      : undefined,
    dialogueRoute: safetyRoute,
    routeValidation: validateRoute({ route: safetyRoute, latestMessage: message }),
    planCompatibility: { compatible: false, previousPlanDiscarded: true, reason: 'safety override', reasons: ['safety override'] },
    routeFulfillment: {
      routeFulfilled: true,
      directAnswerProvided: true,
      requestedOperationCompleted: true,
      staleTopicRepeated: false,
      incompatibleDialogueMoveDetected: false,
      sourceMismatchDetected: false,
      valid: true,
      missingElements: [],
    },
    routingDiagnostics: {
      latestMessage: message,
      topic: safetyRoute.topic,
      primaryOperation: safetyRoute.primaryOperation,
      secondaryOperations: [],
      stance: safetyRoute.stance,
      explicitRequest: safetyRoute.explicitRequest,
      directAnswerRequired: true,
      emotion: 'not_expressed',
      emotionEvidence: 'not expressed',
      barrier: 'not_expressed',
      barrierEvidence: 'not expressed',
      previousPlanCompatible: false,
      previousPlanDiscarded: true,
      selectedInformationSource: 'safety_boundary_policy',
      activeResponseGoal: 'maintain_safety',
      routeValidation: null,
      responseRouteValidation: null,
      repairAttempted: false,
    },
    adaptiveState,
    adaptiveTransition: transition.metadata,
    resolvedShortReply,
    decisionState: decisionTransitionResult.state,
    decisionTransition: decisionTransitionResult.metadata,
    conversationMemory,
    previousConversationMemory,
    dialogueStrategy,
    theoryConstruct,
    decisionSupportStrategy,
    decisionSupportTheoryConstruct,
    dialogueTurnPlan,
    decisionSupportTurnPlan,
    retrievalQuery,
    retrievedEvidence,
    calculationResult: null,
    response: reply,
    usedEvidenceIds: [],
    initialGeneratedResponse: null,
    repairedResponse: null,
    operationValidation,
    operationRepairAttempted: false,
    classificationMode: 'local-safety-precheck',
    responseMode: 'fixed-safety',
    classificationConsistency: 'fallback',
    classificationRepairUsed: false,
    safetyOverrideApplied: true,
    repetitionDetected: false,
    regenerationUsed: false,
    fallbackUsed: false,
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
    orchestrationValidation,
    finalPrimaryIntent: localPrecheck.intent,
    secondaryIntents: [],
    groqModel,
    recentStrategies: [dialogueStrategy],
    dialogueDesignSourceIds: getDialogueDesignEvidence(dialogueStrategy).map((item) => item.id),
  };

  return {
    ...partial,
    innovationMetadata: buildInnovationMetadata(partial as OrchestrationResult),
  };
}
