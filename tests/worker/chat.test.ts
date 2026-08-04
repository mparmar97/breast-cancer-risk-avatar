import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../worker/index';

const fakeEnv: Env = {
  ASSETS: {
    fetch: async () => new Response('not found', { status: 404 }),
  } as unknown as Fetcher,
};

async function postChat(message: unknown): Promise<{ status: number; body: { reply?: string; error?: string } }> {
  const request = new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const response = await worker.fetch(request, fakeEnv, {} as ExecutionContext);
  return { status: response.status, body: await response.json() };
}

describe('POST /api/chat', () => {
  it('explains that a risk estimate is not a diagnosis', async () => {
    const { status, body } = await postChat('Does this mean I have cancer?');
    expect(status).toBe(200);
    expect(body.reply?.toLowerCase()).toContain('not a diagnosis');
  });

  it('acknowledges the user is scared', async () => {
    const { body } = await postChat('I am scared.');
    expect(body.reply?.toLowerCase()).toContain('scared');
  });

  it('recognizes a practical time barrier', async () => {
    const { body } = await postChat('I cannot call while I am working.');
    expect(body.reply?.toLowerCase()).toMatch(/workday|time|break/);
  });

  it('supports contacting a doctor as a next step', async () => {
    const { body } = await postChat('I will contact my doctor.');
    expect(body.reply?.toLowerCase()).toContain('doctor');
  });

  it('gives a generic fallback reply for unrecognized input', async () => {
    const { status, body } = await postChat('What is the weather today?');
    expect(status).toBe(200);
    expect(body.reply).toBeTruthy();
  });

  it('rejects an empty message with a 400', async () => {
    const { status } = await postChat('');
    expect(status).toBe(400);
  });

  it('rejects a non-string message with a 400', async () => {
    const { status } = await postChat(42);
    expect(status).toBe(400);
  });
});
