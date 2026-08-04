import type { Env } from './types';
import { getMockChatReply } from './chat';
import { getMockRiskResult, isRiskBranch } from './mockRisk';

export type { Env };
export const WORKER_VERSION = '0.1.0';

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

async function handleChat(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  const message = (body as { message?: unknown } | null)?.message;

  if (typeof message !== 'string' || message.trim().length === 0) {
    return json({ error: 'message must be a non-empty string' }, 400);
  }

  return json({ reply: getMockChatReply(message) });
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
