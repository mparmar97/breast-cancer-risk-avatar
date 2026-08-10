/**
 * Request-size / privacy controls for anything sent to Groq. Every Groq
 * prompt (classification or generation) is built exclusively from the
 * output of these helpers — never from raw client-supplied history — so
 * developer metadata, adaptive-state objects, API errors, environment
 * values, and unnecessary source URLs can never leak into a provider
 * request. See docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md.
 */

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_RECENT_MESSAGES = 8;
const MAX_HISTORICAL_MESSAGE_LENGTH = 1_000;

/**
 * Builds a bounded, sanitized slice of recent conversation history safe to
 * send to Groq: only `role`/`content` pairs, only the most recent
 * `maxMessages` (default 8) non-empty messages, each trimmed and capped in
 * length. Nothing else (timestamps, ids, diagnostics, adaptive state,
 * errors, source URLs, environment values) is ever included.
 */
export function buildRecentConversationContext(
  history: ReadonlyArray<{ role: string; content: unknown }>,
  options: { maxMessages?: number; maxMessageLength?: number } = {},
): ConversationTurn[] {
  const maxMessages = options.maxMessages ?? MAX_RECENT_MESSAGES;
  const maxMessageLength = options.maxMessageLength ?? MAX_HISTORICAL_MESSAGE_LENGTH;

  const sanitized: ConversationTurn[] = [];
  for (const entry of history) {
    if (entry.role !== 'user' && entry.role !== 'assistant') continue;
    if (typeof entry.content !== 'string') continue;

    const trimmed = entry.content.trim();
    if (trimmed.length === 0) continue;

    sanitized.push({
      role: entry.role,
      content: trimmed.length > maxMessageLength ? `${trimmed.slice(0, maxMessageLength)}…` : trimmed,
    });
  }

  return sanitized.slice(-maxMessages);
}

/**
 * Extracts just the assistant-authored replies from a full conversation,
 * most-recent-last, for repetition checking (see
 * worker/llm/repetitionGuard.ts). Never includes developer metadata.
 */
export function extractRecentAssistantMessages(
  history: ReadonlyArray<{ role: string; content: unknown }>,
  limit = 3,
): string[] {
  const assistantMessages = history
    .filter((entry) => entry.role === 'assistant' && typeof entry.content === 'string')
    .map((entry) => (entry.content as string).trim())
    .filter((content) => content.length > 0);

  return assistantMessages.slice(-limit);
}
