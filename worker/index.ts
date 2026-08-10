import { isDialogueStrategy } from './behavioral/policy';
import { normalizeAdaptiveState, type AdaptiveState } from './behavioral/state';
import {
  normalizeDecisionSupportState,
  type DecisionSupportState,
} from './decisionSupport/types';
import {
  normalizeAssistantDialogueAct,
  normalizeBarrierUnmentionedTurns,
  normalizePendingItem,
  normalizeRecentStrategies,
} from './dialogue/buildConversationContext';
import {
  normalizeConversationMemory,
  type ConversationMemory,
} from './dialogue/conversationMemory';
import { NO_PENDING_ITEM } from './dialogue/types';
import { buildRecentConversationContext } from './llm/conversationContext';
import { DEFAULT_GROQ_MODEL } from './llm/groqClient';
import { getMockRiskResult, isRiskBranch, isRiskResult } from './mockRisk';
import { getDialogueDesignEvidence } from './rag/retrieve';
import { toDialogueDesignMetadata, toSourceMetadata } from './rag/types';
import { orchestrateDialogueTurn } from './orchestration/orchestrateDialogueTurn';
import { buildOrchestrationSummary } from './orchestration/buildOrchestrationSummary';
import { assertLatestMessagePresent, createTurnRequest } from './request/turnRequest';
import { computeEducationalRisk, isCalculatorInputs } from './risk/simplifiedGail';
import type { Env } from './types';

export type { Env };
export const WORKER_VERSION = '0.7.0';

// Used only when a chat request omits (or sends an invalid) risk result.
const DEFAULT_CHAT_RISK_RESULT = getMockRiskResult('average');

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function handleHealth(): Response {
  return json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: WORKER_VERSION,
  });
}

/**
 * GET /api/config-status — reports only whether Groq is configured and
 * which model would be used, never the key itself.
 */
function handleConfigStatus(env: Env): Response {
  const groqConfigured = Boolean(env.GROQ_API_KEY);
  const groqModel = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  return json({
    backendConnected: true,
    groqConfigured,
    groqModel,
    dynamicModeAvailable: groqConfigured,
  });
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleMockRisk(request: Request): Promise<Response> {
  const body = (await readJsonBody(request)) as {
    scenario?: unknown;
    inputs?: unknown;
  } | null;

  if (body?.inputs !== undefined) {
    if (!isCalculatorInputs(body.inputs)) {
      return json(
        {
          error:
            'inputs must include age (35–85), ageAtMenarche, ageAtFirstLiveBirth, firstDegreeRelatives (0–2), priorBiopsies (0–2), and atypicalHyperplasia',
        },
        400,
      );
    }
    return json(computeEducationalRisk(body.inputs));
  }

  const scenario = body?.scenario;
  if (!isRiskBranch(scenario)) {
    return json(
      { error: "Provide calculator inputs, or scenario must be 'average' or 'elevated'" },
      400,
    );
  }

  return json(getMockRiskResult(scenario));
}

interface ChatRequestHistoryEntry {
  role?: unknown;
  content?: unknown;
}

interface ChatRequestBody {
  message?: unknown;
  history?: unknown;
  riskResult?: unknown;
  previousState?: unknown;
  previousDecisionState?: unknown;
  previousConversationMemory?: unknown;
  previousStrategy?: unknown;
  previousAssistantDialogueAct?: unknown;
  pendingItem?: unknown;
  recentStrategies?: unknown;
  barrierUnmentionedTurns?: unknown;
}

/**
 * Adaptive orchestration entrypoint (see docs/GENERAL_DYNAMIC_DIALOGUE_MANAGER.md
 * and docs/PROJECT_INNOVATION_SUMMARY.md):
 *
 * validate → sanitize → safety pre-check → current-turn interpretation →
 * consistency → short-reply resolution → adaptive-state transition →
 * decisional-needs transition → dialogue strategy → decision-support strategy →
 * dialogue-turn plan → decision-support turn plan → medical RAG →
 * dynamic generation → grounding/safety/progression/repetition validation →
 * one repair → local fallback → structured metadata.
 *
 * Groq never independently controls the pipeline.
 */
async function handleChat(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const record = body as ChatRequestBody | null;

  const rawMessage = record?.message;
  if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    return json({ error: 'message must be a non-empty string' }, 400);
  }
  const message = rawMessage.trim();
  assertLatestMessagePresent(message, 'handleChat');

  const rawHistory: ChatRequestHistoryEntry[] = Array.isArray(record?.history)
    ? (record.history as ChatRequestHistoryEntry[])
    : [];
  const historyForContext = rawHistory.map((entry) => ({
    role: typeof entry.role === 'string' ? entry.role : '',
    content: entry.content,
  }));
  const recentConversation = buildRecentConversationContext(historyForContext, { maxMessages: 10 });

  const turnRequest = createTurnRequest({
    latestMessage: message,
    recentConversation,
  });

  const riskResult = isRiskResult(record?.riskResult) ? record.riskResult : DEFAULT_CHAT_RISK_RESULT;
  const previousState: AdaptiveState | undefined = record?.previousState
    ? normalizeAdaptiveState(record.previousState as Partial<AdaptiveState>)
    : undefined;
  const previousDecisionState: DecisionSupportState | undefined = record?.previousDecisionState
    ? normalizeDecisionSupportState(record.previousDecisionState as Partial<DecisionSupportState>)
    : undefined;
  const previousConversationMemory: ConversationMemory = normalizeConversationMemory(
    record?.previousConversationMemory as Partial<ConversationMemory> | undefined,
  );
  void (isDialogueStrategy(record?.previousStrategy) ? record?.previousStrategy : undefined);
  const previousAssistantDialogueAct = normalizeAssistantDialogueAct(record?.previousAssistantDialogueAct);
  const pendingItem = normalizePendingItem(record?.pendingItem) ?? NO_PENDING_ITEM;
  const recentStrategies = normalizeRecentStrategies(record?.recentStrategies);
  const barrierUnmentionedTurns = normalizeBarrierUnmentionedTurns(record?.barrierUnmentionedTurns);

  const result = await orchestrateDialogueTurn(env, {
    latestMessage: turnRequest.latestMessage,
    turnRequest,
    recentConversation,
    riskResult,
    previousAdaptiveState: previousState,
    previousDecisionState,
    previousConversationMemory,
    previousAssistantDialogueAct: previousAssistantDialogueAct ?? undefined,
    pendingConversationItem: pendingItem,
    recentStrategies,
    barrierUnmentionedTurns,
  });

  const dialogueDesignSources = getDialogueDesignEvidence(result.dialogueStrategy).map(toDialogueDesignMetadata);
  const orchestrationSummary = buildOrchestrationSummary(result);

  return json({
    reply: result.response,
    adaptiveState: result.adaptiveState,
    previousAdaptiveState: previousState ?? null,
    decisionState: result.decisionState,
    previousDecisionState: previousDecisionState ?? null,
    conversationMemory: result.conversationMemory,
    previousConversationMemory: result.previousConversationMemory,
    decisionTransition: result.decisionTransition,
    decisionSupportStrategy: result.decisionSupportStrategy,
    decisionSupportTheoryConstruct: result.decisionSupportTheoryConstruct,
    decisionSupportTurnPlan: result.decisionSupportTurnPlan,
    currentTurnEvidence: result.currentTurnInterpretation.currentTurnEvidence,
    currentTurnInterpretation: result.currentTurnInterpretation,
    requestInterpretation: result.requestInterpretation,
    semanticTurn: result.semanticTurn ?? null,
    responsePlan: result.responsePlan
      ? {
          primaryGoal: result.responsePlan.primaryGoal,
          secondaryGoals: result.responsePlan.secondaryGoals,
          directAnswerRequired: result.responsePlan.directAnswerRequired,
          mustAddress: result.responsePlan.mustAddress,
          factsNeeded: result.responsePlan.factsNeeded,
          shouldAskQuestion: result.responsePlan.shouldAskQuestion,
          questionPurpose: result.responsePlan.questionPurpose,
        }
      : null,
    dialogueRoute: result.dialogueRoute
      ? {
          topic: result.dialogueRoute.topic,
          primaryOperation: result.dialogueRoute.primaryOperation,
          secondaryOperations: result.dialogueRoute.secondaryOperations,
          stance: result.dialogueRoute.stance,
          explicitRequest: result.dialogueRoute.explicitRequest,
          directAnswerRequired: result.dialogueRoute.directAnswerRequired,
          emotion: result.dialogueRoute.emotion,
          barrier: result.dialogueRoute.barrier,
          selectedInformationSource: result.dialogueRoute.selectedInformationSource,
          confidence: result.dialogueRoute.confidence,
          routingMode: result.dialogueRoute.routingMode,
          currentTurnEvidence: result.dialogueRoute.currentTurnEvidence,
        }
      : null,
    routingDiagnostics: result.routingDiagnostics ?? null,
    resolvedShortReply: result.resolvedShortReply,
    stateTransition: result.adaptiveTransition,
    strategy: result.dialogueStrategy,
    theoryConstruct: result.theoryConstruct,
    dialogueTurnPlan: result.dialogueTurnPlan,
    retrievalQuery: result.retrievalQuery,
    calculationResult: result.calculationResult,
    sources: result.retrievedEvidence.map(toSourceMetadata),
    dialogueDesignSources,
    usedEvidenceIds: result.usedEvidenceIds,
    initialGeneratedResponse: result.initialGeneratedResponse,
    repairedResponse: result.repairedResponse,
    operationValidation: result.operationValidation,
    operationRepairAttempted: result.operationRepairAttempted,
    classificationMode: result.classificationMode,
    responseMode: result.responseMode,
    groqModel: result.groqModel,
    classificationConsistency: result.classificationConsistency,
    classificationRepairUsed: result.classificationRepairUsed,
    strategyRepeated: result.strategyRepeated,
    strategyProgressionApplied: result.strategyProgressionApplied,
    repetitionDetected: result.repetitionDetected,
    regenerationUsed: result.regenerationUsed,
    similarityScore: result.similarityScore,
    repeatedDialogueMove: result.repeatedDialogueMove,
    dialogueAdvanced: result.dialogueAdvanced,
    primaryGoalSatisfied: result.primaryGoalSatisfied,
    decisionNeedAddressed: result.decisionNeedAddressed,
    unsupportedAssumptionDetected: result.unsupportedAssumptionDetected,
    resolvedIssueRepeated: result.resolvedIssueRepeated,
    directQuestionAnswered: result.directQuestionAnswered,
    shortReplyResolved: result.shortReplyResolved,
    resolvedMeaning: result.resolvedMeaning,
    understandingChanged: result.adaptiveTransition.understandingChanged,
    repeatedExplanationDetected: result.repeatedExplanationDetected,
    practicalRequestFulfilled: result.practicalRequestFulfilled,
    userCorrectionHandled: result.userCorrectionHandled,
    recentStrategies: result.recentStrategies,
    safetyOverrideApplied: result.safetyOverrideApplied,
    fallbackUsed: result.fallbackUsed,
    orchestrationValidation: result.orchestrationValidation,
    innovationMetadata: result.innovationMetadata,
    orchestrationSummary,
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    pipelineTrace: result.pipelineTrace ?? null,
    providerExecution: result.providerExecution ?? null,
    assumptionValidation: result.assumptionValidation ?? null,
    metadataConsistency: result.metadataConsistency ?? null,
    turnRequest: result.turnRequest
      ? {
          turnId: result.turnRequest.turnId,
          sessionId: result.turnRequest.sessionId,
          latestMessage: result.turnRequest.latestMessage,
          receivedAt: result.turnRequest.receivedAt,
        }
      : null,
    timestamp: new Date().toISOString(),
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return handleHealth();
    }

    if (url.pathname === '/api/config-status' && request.method === 'GET') {
      return handleConfigStatus(env);
    }

    if (url.pathname === '/api/mock-risk' && request.method === 'POST') {
      return handleMockRisk(request);
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
