import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';
import { generateOperationFallback } from '../worker/llm/operationFallbacks';
import { interpretCurrentTurnRequest } from '../worker/dialogue/currentTurnInterpretation';
import { convertRiskToNaturalFrequency } from '../worker/risk/convertRiskToNaturalFrequency';
import { getMockRiskResult } from '../worker/mockRisk';

const risk = getMockRiskResult('elevated');
const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const envLocal: Env = { ASSETS: assets };
const envWithKey: Env = { ASSETS: assets, GROQ_API_KEY: 'sk-test-key' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('operationSpecificFallback', () => {
  it('uses natural-frequency fallback text for convert', () => {
    const interpretation = interpretCurrentTurnRequest({
      latestMessage: 'Can you explain 3.2% without using percentages?',
      riskResult: risk,
    });
    const calculation = convertRiskToNaturalFrequency({
      riskPercent: 3.2,
      denominator: 100,
      timeHorizon: '5 years',
    });
    const reply = generateOperationFallback({ interpretation, riskResult: risk, calculation });
    expect(reply).toMatch(/about 3 out of 100/i);
    expect(reply).toMatch(/five years/i);
    expect(reply).not.toMatch(/^A risk estimate describes probability over a specified period/i);
  });

  it('routes failed Groq convert generation through repair then operation-specific fallback', async () => {
    const { retrieveEvidence } = await import('../worker/rag/retrieve');
    const evidenceIds = retrieveEvidence(
      'natural frequency people out of 100 breast cancer risk probability explanation five-year',
      { limit: 3, sourceUse: 'medical-rag' },
    ).map((item) => item.id);
    const evidenceId = evidenceIds[0] ?? 'nci-risk-not-certainty-001';

    let generationCalls = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string) as {
        response_format?: { json_schema?: { name?: string } };
      };
      const schema = payload.response_format?.json_schema?.name ?? '';
      if (schema.includes('interpretation') || schema.includes('classification')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    primaryIntent: 'explain_risk',
                    secondaryIntents: [],
                    understanding: 'uncertain',
                    emotion: 'uncertain',
                    barrier: 'none',
                    selfEfficacy: 'unknown',
                    readiness: 'unclear',
                    safetyFlag: 'none',
                    confidence: 0.8,
                    currentTurnEvidence: {
                      intent: 'explain without percentages',
                      understanding: 'not expressed',
                      emotion: 'not expressed',
                      barrier: 'not expressed',
                      selfEfficacy: 'not expressed',
                      readiness: 'not expressed',
                      safetyFlag: 'not expressed',
                    },
                    refersToPreviousAssistantTurn: false,
                    shortReplyType: 'not_short_reply',
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      generationCalls += 1;
      const reply =
        generationCalls === 1
          ? 'A risk estimate is a probability and not a diagnosis.'
          : 'A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer.';
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ reply, usedEvidenceIds: [evidenceId] }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Can you explain 3.2% without using percentages?',
          riskResult: risk,
          history: [],
        }),
      }),
      envWithKey,
      {} as ExecutionContext,
    );
    const body = (await response.json()) as {
      reply: string;
      fallbackUsed: boolean;
      operationRepairAttempted: boolean;
      operationValidation: { genericSubstitutionDetected: boolean; primaryOperationCompleted: boolean };
      requestInterpretation: { operation: string };
      responseMode: string;
    };

    expect(body.requestInterpretation.operation).toBe('convert');
    expect(body.operationRepairAttempted).toBe(true);
    // Soft repair miss keeps Groq wording (Phase 5 policy) rather than swapping in
    // a local natural-frequency template when the repaired Groq reply is still soft-invalid.
    expect(body.responseMode).toBe('groq-dynamic-rag');
    expect(body.fallbackUsed).toBe(false);
    expect(body.operationValidation.genericSubstitutionDetected).toBe(true);
    expect(body.reply).toMatch(/probability/i);
  });

  it('local path convert reply uses operation-specific fallback', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(
      new Request('https://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Can you explain 3.2% without using percentages?',
          riskResult: risk,
        }),
      }),
      envLocal,
      {} as ExecutionContext,
    );
    const body = (await response.json()) as { reply: string; calculationResult: { approximationText: string } };
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.calculationResult.approximationText).toBe('about 3 out of 100');
    expect(body.reply).toMatch(/about 3 out of 100/i);
  });
});
