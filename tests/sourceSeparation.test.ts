import { describe, expect, it } from 'vitest';
import { getDialogueDesignEvidence, retrieveEvidence } from '../worker/rag/retrieve';

const THEORY_PAPER_SOURCE_IDS = new Set([
  'WOLFE-BRCA-GIST-2015',
  'WIDMER-TUTORIAL-DIALOGUES-2015',
  'REYNA-FTT-2008',
  'MERCADO-ECA-MI-2023',
]);

describe('medical-rag vs. dialogue-design separation', () => {
  it('normal (default) retrieval returns only medical-rag evidence', () => {
    const results = retrieveEvidence('risk probability diagnosis elevated average calculator', { limit: 10 });
    for (const result of results) {
      expect(result.sourceUse).toBe('medical-rag');
    }
  });

  it('normal medical retrieval never returns a dialogue-design/theory-paper source', () => {
    const results = retrieveEvidence(
      'fuzzy trace theory gist motivational interviewing embodied conversational agent teach back',
      { limit: 10 },
    );
    for (const result of results) {
      expect(THEORY_PAPER_SOURCE_IDS.has(result.sourceId)).toBe(false);
    }
  });

  it('explicit sourceUse: "medical-rag" never returns a dialogue-design source', () => {
    const results = retrieveEvidence('teach back motivational interviewing gist fuzzy trace', {
      limit: 10,
      sourceUse: 'medical-rag',
    });
    for (const result of results) {
      expect(result.sourceUse).toBe('medical-rag');
    }
  });

  it('sourceUse: "dialogue-design" never returns a medical-rag source', () => {
    const results = retrieveEvidence('risk probability diagnosis calculator', {
      limit: 10,
      sourceUse: 'dialogue-design',
    });
    for (const result of results) {
      expect(result.sourceUse).toBe('dialogue-design');
    }
  });

  it('getDialogueDesignEvidence returns only dialogue-design sources', () => {
    for (const strategy of [
      'clarify_risk',
      'acknowledge_emotion',
      'explore_barrier',
      'support_self_efficacy',
      'action_planning',
    ] as const) {
      const chunks = getDialogueDesignEvidence(strategy);
      for (const chunk of chunks) {
        expect(chunk.sourceUse).toBe('dialogue-design');
      }
    }
  });

  it('getDialogueDesignEvidence returns an empty array for strategies with no linked source', () => {
    for (const strategy of ['explore_readiness', 'safety_boundary', 'urgent_referral', 'explain_benefit'] as const) {
      expect(getDialogueDesignEvidence(strategy)).toEqual([]);
    }
  });

  it('clarify_risk theory evidence includes REYNA-FTT-2008', () => {
    const chunks = getDialogueDesignEvidence('clarify_risk');
    expect(chunks.some((chunk) => chunk.sourceId === 'REYNA-FTT-2008')).toBe(true);
  });

  it('acknowledge_emotion theory evidence includes MERCADO-ECA-MI-2023', () => {
    const chunks = getDialogueDesignEvidence('acknowledge_emotion');
    expect(chunks.some((chunk) => chunk.sourceId === 'MERCADO-ECA-MI-2023')).toBe(true);
  });

  it('explore_barrier, support_self_efficacy, and action_planning theory evidence include MERCADO-ECA-MI-2023', () => {
    for (const strategy of ['explore_barrier', 'support_self_efficacy', 'action_planning'] as const) {
      const chunks = getDialogueDesignEvidence(strategy);
      expect(chunks.some((chunk) => chunk.sourceId === 'MERCADO-ECA-MI-2023')).toBe(true);
    }
  });
});
