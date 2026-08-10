import { classifyLocalStateDetailed } from '../behavioral/localClassifier';
import type { AdaptiveState } from '../behavioral/state';
import { resolveShortReply } from '../dialogue/resolveShortReply';
import type { AssistantDialogueAct, CurrentTurnInterpretation } from '../dialogue/types';
import type { RiskResult } from '../types';
import {
  buildAdaptiveStateRepairJsonSchema,
  buildClassificationMessages,
  buildClassificationRepairMessages,
  MAX_SECONDARY_INTENTS,
} from './classificationSchema';
import { buildAdaptiveStateJsonSchema } from './classificationSchema';
import {
  categorizeProviderError,
  createGroqChatCompletion,
  type FetchLike,
} from './groqClient';
import type { Env } from '../types';
import type {
  ClassificationMode,
  FallbackReason,
  ProviderErrorCategory,
  ProviderFailureStage,
} from './types';
import { checkEvidenceConsistency, validateAdaptiveStateClassification } from './validateAdaptiveState';

export interface DynamicClassificationInput {
  latestMessage: string;
  recentConversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousState?: AdaptiveState;
  previousAssistantDialogueAct?: AssistantDialogueAct;
  pendingItemText?: string;
  riskResult: RiskResult;
}

export type ClassificationConsistency = 'passed' | 'repaired' | 'fallback';

export interface DynamicClassificationResult {
  interpretation: CurrentTurnInterpretation;
  classificationMode: ClassificationMode;
  classificationConsistency: ClassificationConsistency;
  classificationRepairUsed: boolean;
  fallbackReason?: FallbackReason;
  providerFailureStage?: ProviderFailureStage;
  providerErrorCategory?: ProviderErrorCategory;
}

const CLASSIFICATION_TEMPERATURE = 0.2;
// GPT-OSS reasoning tokens count against this budget before the visible
// JSON output — see worker/llm/groqClient.ts's `reasoningEffort` docs.
const CLASSIFICATION_MAX_TOKENS = 900;

/**
 * Builds a {@link CurrentTurnInterpretation} directly from the local
 * deterministic classifier — exported so worker/index.ts's pre-Groq safety
 * pre-check can reuse the exact same interpretation shape as the full
 * pipeline, without needing to call through Groq first.
 */
export function localFallbackInterpretation(input: DynamicClassificationInput): CurrentTurnInterpretation {
  const detail = classifyLocalStateDetailed(input.latestMessage, input.previousState);
  // The local classifier's own per-field fallback already carries forward
  // unmentioned fields from `previousState`, which is exactly what
  // worker/behavioral/transitionState.ts's "not expressed" branch would
  // reproduce anyway — so re-using its already-merged fields here as the
  // "current-turn" values is idempotent, not a double-merge. Secondary
  // intents and cross-turn reference detection are intentionally not
  // attempted by the local heuristic fallback (documented limitation).
  return {
    primaryIntent: detail.intent,
    secondaryIntents: [],
    understanding: detail.state.understanding,
    emotion: detail.state.emotion,
    barrier: detail.state.barrier,
    selfEfficacy: detail.state.selfEfficacy,
    readiness: detail.state.readiness,
    safetyFlag: detail.state.safetyFlag,
    currentTurnEvidence: detail.currentTurnEvidence,
    refersToPreviousAssistantTurn: Boolean(input.pendingItemText),
    shortReplyType: resolveShortReply(input.latestMessage).shortReplyType,
    confidence: detail.state.confidence,
  };
}

function localFallbackResult(
  fallbackReason: FallbackReason,
  input: DynamicClassificationInput,
  providerMeta?: {
    providerFailureStage?: ProviderFailureStage;
    providerErrorCategory?: ProviderErrorCategory;
  },
): DynamicClassificationResult {
  return {
    interpretation: localFallbackInterpretation(input),
    classificationMode: 'local-fallback',
    classificationConsistency: 'fallback',
    classificationRepairUsed: false,
    fallbackReason,
    ...(providerMeta?.providerFailureStage
      ? { providerFailureStage: providerMeta.providerFailureStage }
      : {}),
    ...(providerMeta?.providerErrorCategory
      ? { providerErrorCategory: providerMeta.providerErrorCategory }
      : {}),
  };
}

function dedupeSecondaryIntents(interpretation: CurrentTurnInterpretation): CurrentTurnInterpretation {
  const filtered = interpretation.secondaryIntents
    .filter((intent) => intent !== interpretation.primaryIntent)
    .filter((intent, index, all) => all.indexOf(intent) === index)
    .slice(0, MAX_SECONDARY_INTENTS);
  return { ...interpretation, secondaryIntents: filtered };
}

async function requestGroqClassification(
  env: Env,
  messages: ReturnType<typeof buildClassificationMessages>,
  schema: ReturnType<typeof buildAdaptiveStateJsonSchema>,
  fetchImpl?: FetchLike,
): Promise<unknown> {
  const completion = await createGroqChatCompletion(
    env,
    {
      messages,
      responseFormat: schema,
      temperature: CLASSIFICATION_TEMPERATURE,
      maxCompletionTokens: CLASSIFICATION_MAX_TOKENS,
      reasoningEffort: 'low',
    },
    fetchImpl,
  );
  return JSON.parse(completion.content);
}

/**
 * Attempts Groq structured current-turn interpretation; falls back to the
 * local, deterministic classifier whenever Groq is unconfigured, fails,
 * times out, or returns output that does not pass local re-validation
 * (see worker/llm/validateAdaptiveState.ts). When the initial response is
 * *structurally* valid but internally inconsistent (a label conflicts with
 * its own evidence — Section 6), makes exactly one structured repair
 * request before falling back to the local classifier. Never throws and
 * never exposes a raw provider error — the caller always receives a usable
 * {@link DynamicClassificationResult}.
 *
 * This function deliberately does NOT merge with `previousState` — it only
 * uses it as read-only prompt context. Merging is the separate,
 * deterministic responsibility of worker/behavioral/transitionState.ts, so
 * the same merge logic applies uniformly whether this turn's interpretation
 * came from Groq or the local fallback.
 */
export async function classifyAdaptiveState(
  env: Env,
  input: DynamicClassificationInput,
  fetchImpl?: FetchLike,
): Promise<DynamicClassificationResult> {
  if (!env.GROQ_API_KEY) {
    return localFallbackResult('missing_configuration', input, {
      providerFailureStage: 'classification',
      providerErrorCategory: 'missing_configuration',
    });
  }

  // Reserve Groq RPM/TPM for response generation when local classification is enabled.
  const localClassification =
    env.GROQ_LOCAL_CLASSIFICATION?.trim().toLowerCase() === '1' ||
    env.GROQ_LOCAL_CLASSIFICATION?.trim().toLowerCase() === 'true';
  if (localClassification) {
    return {
      interpretation: localFallbackInterpretation(input),
      classificationMode: 'local-fallback',
      classificationConsistency: 'passed',
      classificationRepairUsed: false,
    };
  }

  const promptInput = {
    latestMessage: input.latestMessage,
    recentConversation: input.recentConversation,
    previousState: input.previousState
      ? {
          understanding: input.previousState.understanding,
          emotion: input.previousState.emotion,
          barrier: input.previousState.barrier,
          selfEfficacy: input.previousState.selfEfficacy,
          readiness: input.previousState.readiness,
        }
      : undefined,
    previousAssistantDialogueAct: input.previousAssistantDialogueAct,
    pendingItemText: input.pendingItemText,
    riskBranch: input.riskResult.riskBranch,
    riskHorizon: input.riskResult.riskHorizon,
  };

  let rawContent: unknown;
  try {
    rawContent = await requestGroqClassification(
      env,
      buildClassificationMessages(promptInput),
      buildAdaptiveStateJsonSchema(),
      fetchImpl,
    );
  } catch (error) {
    return localFallbackResult('classification_provider_failure', input, {
      providerFailureStage: 'classification',
      providerErrorCategory: categorizeProviderError(error),
    });
  }

  const validation = validateAdaptiveStateClassification(rawContent);
  if (!validation.valid) {
    return localFallbackResult('classification_validation_failure', input);
  }

  const consistency = checkEvidenceConsistency(validation.data);
  if (consistency.consistent) {
    return {
      interpretation: dedupeSecondaryIntents(validation.data),
      classificationMode: 'groq-structured',
      classificationConsistency: 'passed',
      classificationRepairUsed: false,
    };
  }

  // Exactly one structured repair attempt, telling the model precisely
  // which fields conflicted with their own evidence.
  let repairedRaw: unknown;
  try {
    repairedRaw = await requestGroqClassification(
      env,
      buildClassificationRepairMessages({ ...promptInput, priorAttempt: rawContent, conflictingFields: consistency.conflictingFields }),
      buildAdaptiveStateRepairJsonSchema(),
      fetchImpl,
    );
  } catch {
    return { ...localFallbackResult('classification_validation_failure', input), classificationRepairUsed: true };
  }

  const repairValidation = validateAdaptiveStateClassification(repairedRaw);
  if (!repairValidation.valid) {
    return { ...localFallbackResult('classification_validation_failure', input), classificationRepairUsed: true };
  }

  const repairConsistency = checkEvidenceConsistency(repairValidation.data);
  if (!repairConsistency.consistent) {
    return { ...localFallbackResult('classification_validation_failure', input), classificationRepairUsed: true };
  }

  return {
    interpretation: dedupeSecondaryIntents(repairValidation.data),
    classificationMode: 'groq-structured',
    classificationConsistency: 'repaired',
    classificationRepairUsed: true,
  };
}
