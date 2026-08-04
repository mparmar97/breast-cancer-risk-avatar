import { classifyLocalState } from './behavioral/localClassifier';
import { selectDialogueStrategy } from './behavioral/policy';
import { normalizeAdaptiveState, type AdaptiveState } from './behavioral/state';
import { getTheoryConstruct } from './behavioral/theoryMap';
import { generateLocalResponse } from './llm/localGenerator';
import { getMockRiskResult, isRiskBranch, isRiskResult } from './mockRisk';
import { getFixedSafetyResponse } from './safety/safetyResponses';
import { validateResponse } from './safety/validateResponse';
import type { Env } from './types';

export type { Env };
export const WORKER_VERSION = '0.1.0';

// Used only when a chat request omits (or sends an invalid) risk result.
// The demonstration risk result never affects the fixed reply wording in
// this phase, but the generator's signature always expects one.
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

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleMockRisk(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  const scenario = (body as { scenario?: unknown } | null)?.scenario;

  if (!isRiskBranch(scenario)) {
    return json({ error: "scenario must be 'average' or 'elevated'" }, 400);
  }

  return json(getMockRiskResult(scenario));
}

interface ChatRequestBody {
  message?: unknown;
  riskResult?: unknown;
  previousState?: unknown;
}

async function handleChat(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  const record = body as ChatRequestBody | null;

  // 1. Validate input.
  const message = record?.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return json({ error: 'message must be a non-empty string' }, 400);
  }

  const riskResult = isRiskResult(record?.riskResult) ? record.riskResult : DEFAULT_CHAT_RISK_RESULT;
  const previousState = record?.previousState
    ? normalizeAdaptiveState(record.previousState as Partial<AdaptiveState>)
    : undefined;

  // 2. Classify adaptive state (deterministic, local — no server-side history is kept).
  const adaptiveState = classifyLocalState(message, previousState);

  // 3. Select strategy.
  const strategy = selectDialogueStrategy(adaptiveState);

  // 4. Get theory mapping.
  const theoryConstruct = getTheoryConstruct(strategy);

  // 5. Check fixed safety response; 6. otherwise generate a local response.
  const fixedSafetyReply = getFixedSafetyResponse(adaptiveState.safetyFlag);
  const candidateReply = fixedSafetyReply ?? generateLocalResponse(strategy, adaptiveState, riskResult);

  // 7. Validate the response.
  const reply = validateResponse(candidateReply);

  // 8. Return structured output. Nothing is persisted server-side.
  return json({
    reply,
    adaptiveState,
    strategy,
    theoryConstruct,
    responseMode: 'local-fallback',
    timestamp: new Date().toISOString(),
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return handleHealth();
    }

    if (url.pathname === '/api/mock-risk' && request.method === 'POST') {
      return handleMockRisk(request);
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
