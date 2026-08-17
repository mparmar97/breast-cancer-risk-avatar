import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { type Env } from '../worker/index';
import { getMockRiskResult } from '../worker/mockRisk';

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function chat(env: Env, message: string): Promise<{
  reply: string;
  strategy: string;
  responseMode: string;
  classificationMode: string;
  adaptiveState: unknown;
  dialogueRoute?: { topic?: string; primaryOperation?: string };
  semanticTurn?: { topic?: string; primaryOperation?: string };
}> {
  const response = await worker.fetch(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: [],
        riskResult: getMockRiskResult('elevated'),
      }),
    }),
    env,
    {} as ExecutionContext,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Awaited<ReturnType<typeof chat>>;
}

describe('Phase 5 regression with LiveAvatar flags', () => {
  it('produces the same dialogue outcome with LiveAvatar OFF and ON', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const message = 'What does the 3.2% five-year result mean?';
    const off = await chat(
      {
        ASSETS: assets,
        LIVEAVATAR_ENABLED: 'false',
        LIVEAVATAR_SANDBOX: 'true',
      },
      message,
    );
    const on = await chat(
      {
        ASSETS: assets,
        LIVEAVATAR_ENABLED: 'true',
        LIVEAVATAR_SANDBOX: 'true',
        LIVEAVATAR_API_KEY: 'TEST_LIVEAVATAR_SECRET_DO_NOT_EXPOSE',
        LIVEAVATAR_AVATAR_ID: 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a',
      },
      message,
    );

    expect(on.reply).toBe(off.reply);
    expect(on.strategy).toBe(off.strategy);
    expect(on.responseMode).toBe(off.responseMode);
    expect(on.classificationMode).toBe(off.classificationMode);
    expect(on.adaptiveState).toEqual(off.adaptiveState);
    expect(on.dialogueRoute?.topic ?? on.semanticTurn?.topic).toBe(
      off.dialogueRoute?.topic ?? off.semanticTurn?.topic,
    );
    expect(on.dialogueRoute?.primaryOperation ?? on.semanticTurn?.primaryOperation).toBe(
      off.dialogueRoute?.primaryOperation ?? off.semanticTurn?.primaryOperation,
    );

    // Chat must not contact LiveAvatar.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
