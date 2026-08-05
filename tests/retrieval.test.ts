import { describe, expect, it } from 'vitest';
import { retrieveEvidence } from '../worker/rag/retrieve';

function topicsOf(results: ReturnType<typeof retrieveEvidence>): string[] {
  return results.map((result) => result.topic);
}

describe('retrieveEvidence — topical relevance (vetted medical-rag evidence)', () => {
  it('surfaces probability/diagnosis evidence for "Does elevated risk mean I have cancer?"', () => {
    const results = retrieveEvidence('Does elevated risk mean I have cancer?', { limit: 3 });
    const topTwoTopics = topicsOf(results.slice(0, 2));
    expect(
      topTwoTopics.includes('uncertainty_and_limitations') ||
        topTwoTopics.includes('elevated_risk_not_current_cancer'),
    ).toBe(true);
  });

  it('surfaces professional-interpretation evidence for "I do not know who should interpret this."', () => {
    const results = retrieveEvidence('I do not know who should interpret this result.', { limit: 3 });
    const topThreeTopics = topicsOf(results.slice(0, 3));
    expect(topThreeTopics.includes('professional_interpretation')).toBe(true);
  });

  it('surfaces breast-change follow-up evidence for "I found a new lump, what should I do?"', () => {
    const results = retrieveEvidence('I found a new lump, what should I do?', { limit: 3 });
    const topThreeTopics = topicsOf(results.slice(0, 3));
    expect(topThreeTopics.includes('symptom_follow_up')).toBe(true);
  });

  it('surfaces limitation evidence for "Is this result certain?"', () => {
    const results = retrieveEvidence('Is this result certain?', { limit: 3 });
    const topTwoTopics = topicsOf(results.slice(0, 2));
    expect(topTwoTopics.includes('uncertainty_and_limitations')).toBe(true);
  });

  it('surfaces risk-horizon evidence for "What does five-year risk mean?"', () => {
    const results = retrieveEvidence('What does five-year risk mean?', { limit: 3 });
    const topTwoTopics = topicsOf(results.slice(0, 2));
    expect(topTwoTopics.includes('five_year_vs_lifetime_risk')).toBe(true);
  });

  it('surfaces average-risk evidence for "Average risk means I can never get cancer, right?"', () => {
    const results = retrieveEvidence('Average risk means I can never get cancer, right?', { limit: 3 });
    const topTwoTopics = topicsOf(results.slice(0, 2));
    expect(topTwoTopics.includes('average_risk_not_zero')).toBe(true);
  });

  it('never surfaces a dialogue-design (theory-paper) topic for a plain medical question', () => {
    const results = retrieveEvidence('What does five-year risk mean and is it certain?', { limit: 10 });
    const dialogueDesignTopics = new Set([
      'fuzzy_trace_gist',
      'avatar_risk_communication',
      'teach_back',
      'motivational_interviewing_agent',
    ]);
    for (const topic of topicsOf(results)) {
      expect(dialogueDesignTopics.has(topic)).toBe(false);
    }
  });
});

describe('retrieveEvidence — ranking and determinism', () => {
  it('sorts results by score descending', () => {
    const results = retrieveEvidence('risk probability diagnosis cancer elevated', { limit: 10 });
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('breaks ties deterministically by evidence ID', () => {
    const first = retrieveEvidence('breast cancer risk professional interpretation', { limit: 10 });
    const second = retrieveEvidence('breast cancer risk professional interpretation', { limit: 10 });
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));

    // Any group of equal-score results must be in ascending ID order.
    for (let i = 1; i < first.length; i += 1) {
      if (first[i - 1].score === first[i].score) {
        expect(first[i - 1].id.localeCompare(first[i].id)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('never returns duplicate evidence IDs', () => {
    const results = retrieveEvidence('risk probability diagnosis follow up professional', { limit: 10 });
    const ids = results.map((result) => result.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never returns more than the requested limit', () => {
    expect(retrieveEvidence('risk probability diagnosis', { limit: 1 })).toHaveLength(1);
    expect(retrieveEvidence('risk probability diagnosis', { limit: 2 })).toHaveLength(2);
  });

  it('defaults to a limit of 3', () => {
    const results = retrieveEvidence('risk probability diagnosis elevated average cancer follow up');
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('clamps the limit to at least 1 and at most 10', () => {
    expect(retrieveEvidence('risk probability diagnosis', { limit: 0 }).length).toBeLessThanOrEqual(1);
    expect(retrieveEvidence('risk probability diagnosis', { limit: -5 }).length).toBeLessThanOrEqual(1);
    expect(
      retrieveEvidence('risk probability diagnosis follow up professional cost access time', { limit: 100 })
        .length,
    ).toBeLessThanOrEqual(10);
  });

  it('keeps every score between 0 and 1 and never NaN', () => {
    const results = retrieveEvidence('risk probability diagnosis follow up professional cost access time', {
      limit: 10,
    });
    for (const result of results) {
      expect(Number.isNaN(result.score)).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic across repeated calls with the same query', () => {
    const query = 'Who should interpret my elevated risk result?';
    const first = retrieveEvidence(query, { limit: 5 });
    const second = retrieveEvidence(query, { limit: 5 });
    expect(first).toEqual(second);
  });

  it('never mutates the underlying evidence collection', () => {
    const before = retrieveEvidence('risk probability diagnosis', { limit: 3 });
    before.forEach((result) => {
      result.keywords.push('mutated');
      result.text = 'mutated';
    });

    const after = retrieveEvidence('risk probability diagnosis', { limit: 3 });
    expect(after.every((result) => !result.keywords.includes('mutated'))).toBe(true);
    expect(after.every((result) => result.text !== 'mutated')).toBe(true);
  });

  it('returns an empty array for a completely unrelated query', () => {
    const results = retrieveEvidence('purple giraffe skateboard weather forecast tomorrow', { limit: 3 });
    expect(results.length).toBe(0);
  });

  it('defaults sourceUse to "medical-rag" and never returns a dialogue-design chunk', () => {
    const results = retrieveEvidence('teach back gist fuzzy trace motivational interviewing', { limit: 10 });
    for (const result of results) {
      expect(result.sourceUse).toBe('medical-rag');
    }
  });
});
