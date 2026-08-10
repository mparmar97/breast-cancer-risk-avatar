import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';

interface ChatResponseBody {
  reply: string;
  classificationMode: string;
  responseMode: string;
  fallbackReason?: string;
  error?: string;
}

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const envWithoutKey: Env = { ASSETS: assets };
const envWithKey: Env = { ASSETS: assets, GROQ_API_KEY: 'sk-test-key' };

async function postChat(env: Env, message: string): Promise<{ status: number; body: ChatResponseBody }> {
  const request = new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const response = await worker.fetch(request, env, {} as ExecutionContext);
  return { status: response.status, body: (await response.json()) as ChatResponseBody };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Groq fallback behavior (POST /api/chat)', () => {
  it('uses local classification and generation when GROQ_API_KEY is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { status, body } = await postChat(envWithoutKey, 'How does this calculator work?');
    expect(status).toBe(200);
    expect(body.classificationMode).toBe('local-fallback');
    expect(body.responseMode).toBe('local-rag-fallback');
    expect(body.fallbackReason).toBe('missing_configuration');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.reply).toBeTruthy();
  });

  it('falls back to local classification+generation on a Groq timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }),
    );

    const { status, body } = await postChat(envWithKey, 'How does this calculator work?');
    expect(status).toBe(200);
    expect(body.classificationMode).toBe('local-fallback');
    expect(body.responseMode).toBe('local-rag-fallback');
    expect(body.reply).toBeTruthy();
  });

  it('falls back to local classification+generation on a Groq provider failure (HTTP 500)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));

    const { status, body } = await postChat(envWithKey, 'How does this calculator work?');
    expect(status).toBe(200);
    expect(body.classificationMode).toBe('local-fallback');
    expect(body.responseMode).toBe('local-rag-fallback');
    // Both classification and generation fail here (the mock returns 500
    // for every call) — the reported reason is whichever stage failed
    // most recently/proximately to the final reply.
    expect(['classification_provider_failure', 'generation_provider_failure']).toContain(body.fallbackReason);
  });

  it('falls back to local generation when Groq classification succeeds but generation fails validation', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          // Classification call succeeds.
          const classification = {
            primaryIntent: 'general_question',
            secondaryIntents: [],
            understanding: 'uncertain',
            emotion: 'uncertain',
            barrier: 'none',
            selfEfficacy: 'unknown',
            readiness: 'unclear',
            safetyFlag: 'none',
            confidence: 0.6,
            currentTurnEvidence: {
              intent: 'asked a general question',
              understanding: 'not expressed',
              emotion: 'not expressed',
              barrier: 'not expressed',
              selfEfficacy: 'not expressed',
              readiness: 'not expressed',
              safetyFlag: 'not expressed',
            },
            refersToPreviousAssistantTurn: false,
            shortReplyType: 'not_short_reply',
          };
          return Promise.resolve(
            new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(classification) } }] })),
          );
        }
        // Generation call returns invalid JSON.
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: 'not valid json at all' } }] })),
        );
      }),
    );

    const { status, body } = await postChat(envWithKey, 'How does this calculator work?');
    expect(status).toBe(200);
    expect(body.classificationMode).toBe('groq-structured');
    expect(body.responseMode).toBe('local-rag-fallback');
    expect(body.fallbackReason).toBe('generation_validation_failure');
    expect(body.reply).toBeTruthy();
  });

  it('always returns HTTP 200 with a safe, non-empty reply when falling back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const { status, body } = await postChat(envWithKey, 'I do not know who to contact.');
    expect(status).toBe(200);
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(0);
  });

  it('never includes a raw provider error message in the fallback reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'super secret internal provider detail' } }), {
          status: 500,
        }),
      ),
    );

    const { body } = await postChat(envWithKey, 'How does this calculator work?');
    expect(body.fallbackReason).not.toContain('super secret internal provider detail');
    expect(JSON.stringify(body)).not.toContain('super secret internal provider detail');
  });

  it('never exposes the API key anywhere in the response, even on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    const response = await worker.fetch(
      new Request('https://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'How does this work?' }),
      }),
      { ASSETS: assets, GROQ_API_KEY: 'sk-super-secret-value' },
      {} as ExecutionContext,
    );
    const text = await response.text();
    expect(text).not.toContain('sk-super-secret-value');
  });
});
