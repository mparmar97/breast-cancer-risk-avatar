import type {
  AdaptiveState,
  AssistantDialogueAct,
  ChatApiResponse,
  ChatMessage,
  ConfigStatus,
  ConversationMemory,
  DecisionSupportState,
  DialogueStrategy,
  HealthResponse,
  PendingConversationItem,
  CalculatorInputs,
  RiskBranch,
  RiskResult,
} from '../types';

interface ApiErrorBody {
  error?: string;
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as ApiErrorBody;
      if (errorBody.error) {
        message = errorBody.error;
      }
    } catch {
      // Response body wasn't JSON; keep the generic status message.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return parseJsonOrThrow<HealthResponse>(response);
}

/**
 * Reports only whether Groq is configured and which model would be used —
 * never the key itself. Safe to call on app load to show, e.g., a small
 * "dynamic dialogue available" indicator.
 */
export async function fetchConfigStatus(): Promise<ConfigStatus> {
  const response = await fetch('/api/config-status');
  return parseJsonOrThrow<ConfigStatus>(response);
}

export async function fetchMockRisk(scenario: RiskBranch): Promise<RiskResult> {
  const response = await fetch('/api/mock-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  return parseJsonOrThrow<RiskResult>(response);
}

export async function fetchCalculatedRisk(inputs: CalculatorInputs): Promise<RiskResult> {
  const response = await fetch('/api/mock-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs }),
  });
  return parseJsonOrThrow<RiskResult>(response);
}

export interface ChatRoundTripContext {
  previousState: AdaptiveState | null;
  previousDecisionState?: DecisionSupportState | null;
  previousConversationMemory?: ConversationMemory | null;
  previousStrategy?: DialogueStrategy | null;
  previousAssistantDialogueAct?: AssistantDialogueAct | null;
  pendingItem?: PendingConversationItem | null;
  recentStrategies?: DialogueStrategy[];
  barrierUnmentionedTurns?: number;
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  riskResult: RiskResult | null,
  context: ChatRoundTripContext,
): Promise<ChatApiResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map(({ role, content }) => ({ role, content })),
      riskResult,
      previousState: context.previousState,
      previousDecisionState: context.previousDecisionState ?? undefined,
      previousConversationMemory: context.previousConversationMemory ?? undefined,
      previousStrategy: context.previousStrategy ?? undefined,
      previousAssistantDialogueAct: context.previousAssistantDialogueAct ?? undefined,
      pendingItem: context.pendingItem ?? undefined,
      recentStrategies: context.recentStrategies ?? [],
      barrierUnmentionedTurns: context.barrierUnmentionedTurns ?? 0,
    }),
  });
  return parseJsonOrThrow<ChatApiResponse>(response);
}
