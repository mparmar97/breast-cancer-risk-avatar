import type { DialogueStrategy } from '../behavioral/policy';
import type { AdaptiveState, Intent } from '../behavioral/state';
import type { TheoryConstruct } from '../behavioral/theoryMap';
import type {
  DecisionSupportState,
  DecisionSupportStrategy,
  DecisionSupportTurnPlan,
} from '../decisionSupport/types';
import type { ConversationMemory } from '../dialogue/conversationMemory';
import type { RequestInterpretation } from '../dialogue/currentTurnInterpretation';
import { createDefaultConversationMemory } from '../dialogue/conversationMemory';
import { deriveResponsePlan, type ResponsePlan } from '../dialogue/deriveResponsePlan';
import type { DialogueTurnPlan } from '../dialogue/types';
import type { NaturalFrequencyResult } from '../risk/convertRiskToNaturalFrequency';
import type { SemanticTurn } from '../dialogue/semanticTurn';
import type { RetrievedEvidence } from '../rag/types';
import type { RiskResult } from '../types';
import { validateGeneratedReply } from '../safety/validateResponse';
import { validateGroundedEvidence } from '../safety/validateGrounding';
import type { Env } from '../types';
import { buildDynamicResponseJsonSchema, buildGenerationMessages, REPLY_MAX_CHARACTERS } from './generationSchema';
import {
  categorizeProviderError,
  createGroqChatCompletion,
  type FetchLike,
} from './groqClient';
import type {
  FallbackReason,
  ProviderErrorCategory,
  ProviderFailureStage,
  ResponseMode,
} from './types';
import { generateLocalResponse } from './localGenerator';
import { generateOperationFallback } from './operationFallbacks';
import { generatePlanAwareFallback } from './planAwareFallback';
import { shouldUseOperationFallback } from '../dialogue/currentTurnInterpretation';
import { shouldUseSemanticFallback } from '../dialogue/semanticTurn';

export interface DynamicResponseInput {
  latestMessage: string;
  recentConversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  adaptiveState: AdaptiveState;
  previousAdaptiveState?: AdaptiveState;
  primaryIntent?: Intent;
  secondaryIntents?: Intent[];
  resolvedMeaning?: string;
  strategy: DialogueStrategy;
  theoryConstruct: TheoryConstruct;
  dialogueTurnPlan?: DialogueTurnPlan;
  decisionState?: DecisionSupportState;
  previousDecisionState?: DecisionSupportState;
  decisionSupportStrategy?: DecisionSupportStrategy;
  decisionSupportTurnPlan?: DecisionSupportTurnPlan;
  conversationMemory?: ConversationMemory;
  requestInterpretation?: RequestInterpretation;
  calculationResult?: NaturalFrequencyResult | null;
  semanticTurn?: SemanticTurn;
  responsePlan?: ResponsePlan;
  riskResult: RiskResult;
  retrievedEvidence: RetrievedEvidence[];
  recentAssistantMessages: string[];
  avoidRepeatingReply?: string;
  repeatedDialogueMove?: string;
  progressionIssue?: string;
  operationRepairInstruction?: string;
}

export interface DynamicResponseResult {
  reply: string;
  usedEvidenceIds: string[];
  responseMode: ResponseMode;
  fallbackReason?: FallbackReason;
  providerFailureStage?: ProviderFailureStage;
  providerErrorCategory?: ProviderErrorCategory;
  /** Sanitized local validation failure reason (never raw model text). */
  generationValidationReason?: string;
}

const GENERATION_TEMPERATURE = 0.6;
// GPT-OSS reasoning tokens count against this budget before the visible
// JSON output — see worker/llm/groqClient.ts's `reasoningEffort` docs.
const GENERATION_MAX_TOKENS = 2000;
const GENERATION_TIMEOUT_MS = 22_000;

function localFallback(
  input: DynamicResponseInput,
  fallbackReason: FallbackReason,
  providerMeta?: {
    providerFailureStage?: ProviderFailureStage;
    providerErrorCategory?: ProviderErrorCategory;
    generationValidationReason?: string;
  },
): DynamicResponseResult {
  const withMeta = (result: DynamicResponseResult): DynamicResponseResult => ({
    ...result,
    ...(providerMeta?.providerFailureStage
      ? { providerFailureStage: providerMeta.providerFailureStage }
      : {}),
    ...(providerMeta?.providerErrorCategory
      ? { providerErrorCategory: providerMeta.providerErrorCategory }
      : {}),
    ...(providerMeta?.generationValidationReason
      ? { generationValidationReason: providerMeta.generationValidationReason }
      : {}),
  });

  // Prefer retrieved evidence IDs on local fallback so developer/CSV exports
  // show which RAG chunks grounded the reply when Groq was unavailable.
  const evidenceIds = input.retrievedEvidence.slice(0, 3).map((item) => item.id);

  const responsePlan =
    input.responsePlan ??
    (input.semanticTurn
      ? deriveResponsePlan({
          semanticTurn: input.semanticTurn,
          conversationMemory: input.conversationMemory ?? createDefaultConversationMemory(),
          riskResult: input.riskResult,
        })
      : undefined);
  const routeOwnedPlan = Boolean(
    responsePlan &&
      /screening|deferral|calling-during-work|natural-frequency|calculator_metadata|list calculator|address_practical|correct probability|lifestyle|preparation|list_questions/i.test(
        responsePlan.primaryGoal,
      ),
  );

  if (input.requestInterpretation && shouldUseOperationFallback(input.requestInterpretation)) {
    return withMeta({
      reply: generateOperationFallback({
        interpretation: input.requestInterpretation,
        riskResult: input.riskResult,
        calculation: input.calculationResult,
        plan: responsePlan,
        retrievedEvidence: input.retrievedEvidence,
        latestMessage: input.latestMessage,
        recentAssistantMessages: input.recentAssistantMessages,
      }),
      usedEvidenceIds: evidenceIds,
      responseMode: 'local-rag-fallback',
      fallbackReason,
    });
  }
  if (input.semanticTurn && responsePlan && (shouldUseSemanticFallback(input.semanticTurn) || routeOwnedPlan)) {
    return withMeta({
      reply: generatePlanAwareFallback({
        semanticTurn: input.semanticTurn,
        plan: responsePlan,
        riskResult: input.riskResult,
        calculation: input.calculationResult,
        conversationMemory: input.conversationMemory,
        recentAssistantMessages: input.recentAssistantMessages,
        retrievedEvidence: input.retrievedEvidence,
        latestMessage: input.latestMessage,
      }),
      usedEvidenceIds: evidenceIds,
      responseMode: 'local-rag-fallback',
      fallbackReason,
    });
  }
  // Prefer plan-aware / semantic fallback whenever a turn plan exists so RAG-
  // oriented routes still answer from grounded templates after provider failure.
  if (input.semanticTurn && responsePlan) {
    return withMeta({
      reply: generatePlanAwareFallback({
        semanticTurn: input.semanticTurn,
        plan: responsePlan,
        riskResult: input.riskResult,
        calculation: input.calculationResult,
        conversationMemory: input.conversationMemory,
        recentAssistantMessages: input.recentAssistantMessages,
        retrievedEvidence: input.retrievedEvidence,
        latestMessage: input.latestMessage,
      }),
      usedEvidenceIds: evidenceIds,
      responseMode: 'local-rag-fallback',
      fallbackReason,
    });
  }
  const reply = generateLocalResponse({
    strategy: input.strategy,
    state: input.adaptiveState,
    riskResult: input.riskResult,
    evidence: input.retrievedEvidence,
    primaryIntent: input.primaryIntent,
    dialogueTurnPlan: input.dialogueTurnPlan,
    decisionSupportStrategy: input.decisionSupportStrategy,
    selectedOption:
      input.conversationMemory?.selectedCommunicationOption ?? input.decisionState?.selectedOption,
    actionTiming: input.conversationMemory?.plannedTiming ?? input.decisionState?.actionTiming,
    draftStatus: input.conversationMemory?.draftStatus ?? input.decisionState?.draftStatus,
    conversationMemory: input.conversationMemory,
    requestInterpretation: input.requestInterpretation,
    calculationResult: input.calculationResult,
    latestMessage: input.latestMessage,
    recentAssistantMessages: input.recentAssistantMessages,
  });
  return withMeta({ reply, usedEvidenceIds: evidenceIds, responseMode: 'local-rag-fallback', fallbackReason });
}

/**
 * Attempts Groq structured, evidence-grounded response generation.
 * Prefers groq-dynamic-rag for every turn. Local fallback is used for
 * infrastructure failures (rate limit / network / timeout / missing config /
 * auth / provider outage) and for hard safety / unusable-output failures —
 * not for soft length/question limits or repetition. Never throws.
 */
export async function generateDynamicResponse(
  env: Env,
  input: DynamicResponseInput,
  fetchImpl?: FetchLike,
): Promise<DynamicResponseResult> {
  if (!env.GROQ_API_KEY) {
    return localFallback(input, 'missing_configuration', {
      providerFailureStage: 'response_generation',
      providerErrorCategory: 'missing_configuration',
    });
  }

  let rawContent: string;
  try {
    const messages = buildGenerationMessages({
      latestMessage: input.latestMessage,
      recentConversation: input.recentConversation,
      adaptiveState: input.adaptiveState,
      previousAdaptiveState: input.previousAdaptiveState,
      primaryIntent: input.primaryIntent,
      secondaryIntents: input.secondaryIntents,
      resolvedMeaning: input.resolvedMeaning,
      strategy: input.strategy,
      theoryConstruct: input.theoryConstruct,
      dialogueTurnPlan: input.dialogueTurnPlan,
      decisionState: input.decisionState,
      previousDecisionState: input.previousDecisionState,
      decisionSupportStrategy: input.decisionSupportStrategy,
      decisionSupportTurnPlan: input.decisionSupportTurnPlan,
      conversationMemory: input.conversationMemory,
      requestInterpretation: input.requestInterpretation,
      calculationResult: input.calculationResult,
      semanticTurn: input.semanticTurn,
      responsePlan: input.responsePlan,
      riskResult: input.riskResult,
      retrievedEvidence: input.retrievedEvidence,
      recentAssistantMessages: input.recentAssistantMessages,
      avoidRepeatingReply: input.avoidRepeatingReply,
      repeatedDialogueMove: input.repeatedDialogueMove,
      progressionIssue: input.progressionIssue,
      operationRepairInstruction: input.operationRepairInstruction,
    });

    const completion = await createGroqChatCompletion(
      env,
      {
        messages,
        responseFormat: buildDynamicResponseJsonSchema(),
        temperature: GENERATION_TEMPERATURE,
        maxCompletionTokens: GENERATION_MAX_TOKENS,
        timeoutMs: GENERATION_TIMEOUT_MS,
        reasoningEffort: 'low',
      },
      fetchImpl,
    );
    rawContent = completion.content;
  } catch (error) {
    // No usable Groq text without a successful call — always local here.
    // Infrastructure categories (rate limit / network / timeout / …) are the
    // intended fallback path; other thrown errors are also unusable output.
    return localFallback(input, 'generation_provider_failure', {
      providerFailureStage: 'response_generation',
      providerErrorCategory: categorizeProviderError(error),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return localFallback(input, 'generation_validation_failure', {
      providerFailureStage: 'response_generation',
      providerErrorCategory: 'invalid_structured_output',
      generationValidationReason: 'invalid_json',
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return localFallback(input, 'generation_validation_failure', {
      providerFailureStage: 'response_generation',
      providerErrorCategory: 'invalid_structured_output',
      generationValidationReason: 'invalid_object',
    });
  }
  const record = parsed as Record<string, unknown>;
  // Models sometimes add helper keys; keep only schema fields instead of failing the turn.
  const replyRaw = record.reply;
  const usedEvidenceIdsRaw = record.usedEvidenceIds ?? [];

  // Clinician question lists intentionally contain several "?" and may be longer.
  const clinicianQuestionList =
    input.responsePlan?.primaryGoal === 'list_questions_for_clinician' ||
    (input.semanticTurn?.primaryOperation === 'list_information' &&
      input.semanticTurn.topic === 'professional_interpretation') ||
    /questions?.{0,40}(doctor|clinician|professional)/i.test(input.latestMessage) ||
    /ask (the )?(doctor|clinician|professional)/i.test(input.latestMessage);
  const detailedList =
    clinicianQuestionList &&
    (/detailed/i.test(
      input.responsePlan?.responseStyle?.requestedFormat ??
        input.semanticTurn?.requestedFormat ??
        '',
    ) ||
      /\b(in detail|indetail|detailed|more detail)\b/i.test(input.latestMessage));
  const maxCharacters = clinicianQuestionList
    ? detailedList
      ? 2000
      : 1400
    : REPLY_MAX_CHARACTERS;

  if (typeof replyRaw !== 'string' || replyRaw.length === 0 || replyRaw.length > maxCharacters) {
    return localFallback(input, 'generation_validation_failure', {
      providerFailureStage: 'response_generation',
      providerErrorCategory: replyRaw === '' || replyRaw == null ? 'empty_response' : 'invalid_structured_output',
      generationValidationReason:
        typeof replyRaw !== 'string'
          ? 'reply_not_string'
          : replyRaw.length === 0
            ? 'empty_reply'
            : 'reply_too_many_characters',
    });
  }
  const reply = replyRaw;

  if (!Array.isArray(usedEvidenceIdsRaw) || !usedEvidenceIdsRaw.every((id) => typeof id === 'string')) {
    return localFallback(input, 'generation_validation_failure', {
      providerFailureStage: 'response_generation',
      providerErrorCategory: 'schema_validation',
      generationValidationReason: 'invalid_evidence_ids',
    });
  }
  let usedEvidenceIds = usedEvidenceIdsRaw as string[];

  // Drop unknown / fabricated citation IDs rather than failing the whole response.
  if (input.retrievedEvidence.length > 0) {
    const validIds = new Set(input.retrievedEvidence.map((e) => e.id));
    usedEvidenceIds = usedEvidenceIds.filter((id) => validIds.has(id));
  } else {
    usedEvidenceIds = [];
  }

  // Strip light markdown that models sometimes add (lists/bold) before validation.
  const normalizedReply = clinicianQuestionList
    ? reply
        .replace(/\*\*/g, '')
        .replace(/^\s*[-*]\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : reply.trim();

  const replyValidation = validateGeneratedReply(
    normalizedReply,
    clinicianQuestionList
      ? {
          maxWords: detailedList ? 280 : 180,
          maxQuestions: 12,
        }
      : undefined,
  );
  // Soft structural limits: keep Groq reply. Hard safety / leak / empty: local.
  const softValidationOnly =
    !replyValidation.valid &&
    (replyValidation.reason === 'too_long' || replyValidation.reason === 'too_many_questions');
  if (!replyValidation.valid && !softValidationOnly) {
    return localFallback(input, 'generation_validation_failure', {
      providerFailureStage: 'response_generation',
      providerErrorCategory: 'invalid_structured_output',
      generationValidationReason: replyValidation.reason,
    });
  }

  let groundingValidation = validateGroundedEvidence({
    usedEvidenceIds,
    retrievedEvidence: input.retrievedEvidence,
    strategy: input.strategy,
    reply: normalizedReply,
  });

  // If clarify/explain forgot citations but retrieval returned evidence, attach top IDs
  // instead of discarding an otherwise valid reply (common GPT-OSS omission).
  if (
    !groundingValidation.valid &&
    input.retrievedEvidence.length > 0 &&
    usedEvidenceIds.length === 0 &&
    (input.strategy === 'clarify_risk' || input.strategy === 'explain_benefit')
  ) {
    const autoIds = input.retrievedEvidence.slice(0, 2).map((e) => e.id);
    groundingValidation = validateGroundedEvidence({
      usedEvidenceIds: autoIds,
      retrievedEvidence: input.retrievedEvidence,
      strategy: input.strategy,
      reply: normalizedReply,
    });
  }

  // Question-list / non-medical-claim routes: do not fail solely on grounding.
  if (!groundingValidation.valid && clinicianQuestionList) {
    groundingValidation = { valid: true, usedEvidenceIds: usedEvidenceIds.slice(0, 2) };
  }

  // Prefer Groq wording: if grounding still fails, drop citations rather than
  // replacing with local templates — except ungrounded numeric medical claims.
  if (!groundingValidation.valid) {
    const hasUngroundedNumericClaim =
      /\d+(\.\d+)?\s*(%|percent|in\s+100|times (more|less) likely)/i.test(normalizedReply);
    if (hasUngroundedNumericClaim) {
      return localFallback(input, 'generation_validation_failure', {
        providerFailureStage: 'response_generation',
        providerErrorCategory: 'schema_validation',
        generationValidationReason: 'grounding_failed',
      });
    }
    groundingValidation = { valid: true, usedEvidenceIds: [] };
  }

  return {
    reply: normalizedReply,
    usedEvidenceIds: groundingValidation.usedEvidenceIds,
    responseMode: 'groq-dynamic-rag',
  };
}
