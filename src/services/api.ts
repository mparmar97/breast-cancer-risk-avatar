import type { ChatMessage, HealthResponse, RiskBranch, RiskResult } from '../types';

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

export async function fetchMockRisk(scenario: RiskBranch): Promise<RiskResult> {
  const response = await fetch('/api/mock-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  return parseJsonOrThrow<RiskResult>(response);
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map(({ role, content }) => ({ role, content })),
    }),
  });
  const data = await parseJsonOrThrow<{ reply: string }>(response);
  return data.reply;
}
