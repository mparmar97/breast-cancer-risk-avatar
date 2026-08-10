/**
 * Stable turn request: preserves the latest user message through the pipeline.
 */

export interface TurnRequest {
  turnId: string;
  sessionId: string;
  latestMessage: string;
  recentConversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  receivedAt: string;
}

export class LatestMessagePropagationError extends Error {
  code = 'LATEST_MESSAGE_PROPAGATION_FAILURE' as const;

  constructor(stage: string) {
    super(`Latest message missing or empty at stage: ${stage}`);
    this.name = 'LatestMessagePropagationError';
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createTurnRequest(input: {
  latestMessage: string;
  recentConversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionId?: string;
  turnId?: string;
  receivedAt?: string;
}): TurnRequest {
  const latestMessage = input.latestMessage.trim();
  assertLatestMessagePresent(latestMessage, 'createTurnRequest');
  return {
    turnId: input.turnId ?? createId(),
    sessionId: input.sessionId ?? 'anonymous',
    latestMessage,
    recentConversation: input.recentConversation,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
  };
}

export function assertLatestMessagePresent(message: string, stage: string): void {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new LatestMessagePropagationError(stage);
  }
}
