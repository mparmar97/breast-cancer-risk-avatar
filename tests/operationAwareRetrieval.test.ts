import { describe, expect, it } from 'vitest';
import { createDefaultAdaptiveState } from '../worker/behavioral/state';
import { interpretCurrentTurnRequest, shouldSkipMedicalRag } from '../worker/dialogue/currentTurnInterpretation';
import { buildOperationAwareRetrievalQuery } from '../worker/rag/buildRetrievalQuery';
import { getMockRiskResult } from '../worker/mockRisk';

const risk = getMockRiskResult('elevated');
const state = createDefaultAdaptiveState();

function queryFor(message: string) {
  const requestInterpretation = interpretCurrentTurnRequest({ latestMessage: message, riskResult: risk });
  return {
    requestInterpretation,
    query: buildOperationAwareRetrievalQuery({
      message,
      state,
      strategy: 'clarify_risk',
      riskResult: risk,
      requestInterpretation,
      skipMedicalRag: shouldSkipMedicalRag(requestInterpretation),
    }),
  };
}

describe('operationAwareRetrieval', () => {
  it('builds a specific limitations query rather than broad risk meaning', () => {
    const { query } = queryFor(
      'Explain why the calculator cannot predict exactly what will happen to me.',
    );
    expect(query.toLowerCase()).toMatch(/limitation|population|individual|uncertainty|predict/);
    expect(query.toLowerCase()).not.toBe('breast cancer risk meaning');
  });

  it('builds an inputs-focused query', () => {
    const { query } = queryFor('What information did the calculator use?');
    expect(query.toLowerCase()).toMatch(/input|factor/);
  });

  it('builds a time-horizon comparison query', () => {
    const { query } = queryFor('What is the difference between five-year and lifetime risk?');
    expect(query.toLowerCase()).toMatch(/five-year|lifetime/);
  });

  it('skips medical RAG for greeting / closing / draft acceptance', () => {
    expect(shouldSkipMedicalRag(interpretCurrentTurnRequest({ latestMessage: 'Hello' }))).toBe(true);
    expect(
      shouldSkipMedicalRag(
        interpretCurrentTurnRequest({ latestMessage: 'Thanks, that answers my questions.' }),
      ),
    ).toBe(true);
    expect(
      shouldSkipMedicalRag(
        interpretCurrentTurnRequest({
          latestMessage: 'That draft sounds clear.',
          previousDraftPending: true,
        }),
      ),
    ).toBe(true);
  });
});
