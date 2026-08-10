import type { DialogueStrategy } from '../behavioral/policy';
import { normalizeAdaptiveState, type AdaptiveState } from '../behavioral/state';
import { buildRecentConversationContext, extractRecentAssistantMessages } from '../llm/conversationContext';
import type { RiskResult } from '../types';
import {
  NO_PENDING_ITEM,
  type AssistantDialogueAct,
  type ConversationContext,
  type PendingConversationItem,
} from './types';
import { ASSISTANT_DIALOGUE_ACT_VALUES } from './types';
import { isDialogueStrategy } from '../behavioral/policy';

const MAX_RECENT_MESSAGES = 10;
const MAX_RECENT_STRATEGIES = 3;

interface RawHistoryEntry {
  role?: unknown;
  content?: unknown;
}

function isPendingItemType(value: unknown): value is PendingConversationItem['type'] {
  return (
    value === 'question' ||
    value === 'single_option' ||
    value === 'multiple_options' ||
    value === 'teach_back' ||
    value === 'comprehension_check' ||
    value === 'action_commitment' ||
    value === 'proposed_draft' ||
    value === 'none'
  );
}

function isExpectedReplyType(value: unknown): value is NonNullable<PendingConversationItem['expectedReplyType']> {
  return (
    value === 'affirmation' ||
    value === 'negation' ||
    value === 'explanation' ||
    value === 'choice' ||
    value === 'review_or_acceptance' ||
    value === 'open_response' ||
    value === 'none'
  );
}

/**
 * Locally re-validates a client-supplied `pendingItem` before trusting it —
 * a malformed or tampered value falls back to "no pending item" rather
 * than being used to resolve a short reply incorrectly.
 */
export function normalizePendingItem(value: unknown): PendingConversationItem | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (!isPendingItemType(record.type)) return undefined;
  if (record.type === 'none') return NO_PENDING_ITEM;

  return {
    type: record.type,
    text: typeof record.text === 'string' ? record.text.slice(0, 500) : undefined,
    option: typeof record.option === 'string' ? record.option.slice(0, 200) : undefined,
    draftText: typeof record.draftText === 'string' ? record.draftText.slice(0, 800) : undefined,
    draftPurpose: typeof record.draftPurpose === 'string' ? record.draftPurpose.slice(0, 200) : undefined,
    expectedReplyType: isExpectedReplyType(record.expectedReplyType) ? record.expectedReplyType : 'none',
  };
}

export function normalizeAssistantDialogueAct(value: unknown): AssistantDialogueAct | undefined {
  return typeof value === 'string' && (ASSISTANT_DIALOGUE_ACT_VALUES as readonly string[]).includes(value)
    ? (value as AssistantDialogueAct)
    : undefined;
}

export function normalizeRecentStrategies(value: unknown): DialogueStrategy[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDialogueStrategy).slice(-MAX_RECENT_STRATEGIES);
}

export function normalizeBarrierUnmentionedTurns(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), 20) : 0;
}

export interface BuildConversationContextInput {
  latestMessage: string;
  history: RawHistoryEntry[];
  previousState?: unknown;
  previousStrategy?: unknown;
  previousAssistantDialogueAct?: unknown;
  pendingItem?: unknown;
  recentStrategies?: unknown;
  barrierUnmentionedTurns?: unknown;
  riskResult: RiskResult;
}

/**
 * Assembles the full {@link ConversationContext} for a single turn from
 * raw (client-supplied, therefore untrusted) request data. Every field is
 * independently validated/coerced — a malformed or missing value never
 * crashes the pipeline, it just falls back to "no prior context". Retains
 * at most the 10 most recent conversational messages; the latest user
 * message is always preserved separately and in full.
 */
export function buildConversationContext(input: BuildConversationContextInput): ConversationContext {
  const historyForContext = input.history.map((entry) => ({
    role: typeof entry.role === 'string' ? entry.role : '',
    content: entry.content,
  }));

  const recentMessages = buildRecentConversationContext(historyForContext, { maxMessages: MAX_RECENT_MESSAGES });
  const recentAssistantResponses = extractRecentAssistantMessages(historyForContext, 5);

  const previousAdaptiveState: AdaptiveState | undefined = input.previousState
    ? normalizeAdaptiveState(input.previousState as Partial<AdaptiveState>)
    : undefined;

  const previousStrategy = isDialogueStrategy(input.previousStrategy) ? input.previousStrategy : undefined;
  const previousAssistantDialogueAct = normalizeAssistantDialogueAct(input.previousAssistantDialogueAct);
  const pendingItem = normalizePendingItem(input.pendingItem);
  const recentStrategies = normalizeRecentStrategies(input.recentStrategies);
  const barrierUnmentionedTurns = normalizeBarrierUnmentionedTurns(input.barrierUnmentionedTurns);

  return {
    latestMessage: input.latestMessage,
    recentMessages,
    previousAdaptiveState,
    previousStrategy,
    previousAssistantDialogueAct,
    pendingItem,
    recentStrategies,
    barrierUnmentionedTurns,
    recentAssistantResponses,
    demonstrationRiskResult: input.riskResult,
  };
}
