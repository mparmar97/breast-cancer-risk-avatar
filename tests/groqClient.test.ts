import { describe, expect, it, vi } from 'vitest';
import {
  createGroqChatCompletion,
  DEFAULT_GROQ_MODEL,
  GROQ_CHAT_COMPLETIONS_URL,
  GroqRequestError,
} from '../worker/llm/groqClient';
import type { Env } from '../worker/types';

const baseEnv: Env = {
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
  GROQ_API_KEY: 'sk-test-key-do-not-log',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function successBody(content: string, model = DEFAULT_GROQ_MODEL) {
  return { choices: [{ message: { content } }], model };
}

describe('createGroqChatCompletion', () => {
  it('sends the correct endpoint with Bearer authorization and JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody('{"ok":true}')));
    await createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GROQ_CHAT_COMPLETIONS_URL);
    expect(init.headers.Authorization).toBe('Bearer sk-test-key-do-not-log');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('uses the configured model when GROQ_MODEL is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody('{}')));
    await createGroqChatCompletion(
      { ...baseEnv, GROQ_MODEL: 'llama-custom-model' },
      { messages: [{ role: 'user', content: 'hi' }] },
      fetchMock,
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.model).toBe('llama-custom-model');
  });

  it('uses the default model when GROQ_MODEL is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody('{}')));
    await createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.model).toBe(DEFAULT_GROQ_MODEL);
  });

  it('sends n: 1 and stream: false, never requesting streaming', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody('{}')));
    await createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.n).toBe(1);
    expect(payload.stream).toBe(false);
  });

  it('throws missing_configuration and never calls fetch when the API key is absent', async () => {
    const fetchMock = vi.fn();
    const envWithoutKey: Env = { ASSETS: baseEnv.ASSETS };
    await expect(
      createGroqChatCompletion(envWithoutKey, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'missing_configuration' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose the API key in a thrown error message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad' } }, 401));
    try {
      await createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GroqRequestError);
      expect((error as Error).message).not.toContain('sk-test-key-do-not-log');
      expect(JSON.stringify(error)).not.toContain('sk-test-key-do-not-log');
    }
  });

  it('handles HTTP 400 as a non-retryable provider_error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad request' } }, 400));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'provider_error', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles HTTP 401 as a non-retryable authentication_error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'unauthorized' } }, 401));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'authentication_error', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles HTTP 429 as a retryable rate_limited error and retries at most once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'slow down' } }, 429));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'rate_limited', retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('handles HTTP 500 as provider_error without retry (only timeout/network/rate_limit retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'oops' } }, 500));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'provider_error', retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry HTTP 500 even when marked retryable on the error object', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'oops' } }, 500));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles a network error (rejected fetch) as retryable and retries at most once', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'network_error', retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('handles a timeout (AbortError) as retryable', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'timeout', retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('handles malformed provider JSON as invalid_response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('validates that choices[0].message.content is a string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 42 } }] }));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('does not retry a non-retryable failure (HTTP 400) twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad' } }, 400));
    await expect(
      createGroqChatCompletion(baseEnv, { messages: [{ role: 'user', content: 'hi' }] }, fetchMock),
    ).rejects.toBeInstanceOf(GroqRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
