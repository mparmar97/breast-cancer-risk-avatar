import { describe, expect, it } from 'vitest';
import { cosineSimilarity, createTermFrequency, normalizeText, tokenize } from '../worker/rag/tokenize';

describe('normalizeText', () => {
  it('converts uppercase to lowercase', () => {
    expect(normalizeText('RISK')).toBe('risk');
  });

  it('replaces hyphens with spaces', () => {
    expect(normalizeText('five-year')).toBe('five year');
  });

  it('removes punctuation while preserving letters and numbers', () => {
    expect(normalizeText('Five-year risk: 3.2%!')).toBe('five year risk 3 2');
  });

  it('normalizes repeated whitespace', () => {
    expect(normalizeText('risk   is    elevated')).toBe('risk is elevated');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  risk  ')).toBe('risk');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('tokenize', () => {
  it('removes common stop words', () => {
    const tokens = tokenize('The risk is elevated and I should follow up');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('and');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('should');
  });

  it('keeps meaningful medical and behavioral terms', () => {
    const tokens = tokenize(
      'risk cancer diagnosis probability follow doctor clinician barrier cost time access fear trust calculator five lifetime certainty appointment patient portal',
    );
    for (const term of [
      'risk',
      'cancer',
      'diagnosis',
      'probability',
      'follow',
      'doctor',
      'clinician',
      'barrier',
      'cost',
      'time',
      'access',
      'fear',
      'trust',
      'calculator',
      'five',
      'lifetime',
      'certainty',
      'appointment',
      'patient',
      'portal',
    ]) {
      expect(tokens).toContain(term);
    }
  });

  it('removes empty tokens produced by punctuation-only fragments', () => {
    const tokens = tokenize('risk -- -- cancer');
    expect(tokens.every((token) => token.length > 0)).toBe(true);
  });

  it('returns an empty array for empty text', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns an empty array for text made up only of stop words', () => {
    expect(tokenize('the is and')).toEqual([]);
  });
});

describe('createTermFrequency', () => {
  it('counts occurrences and divides by total token count', () => {
    const freq = createTermFrequency(['risk', 'risk', 'cancer']);
    expect(freq.get('risk')).toBeCloseTo(2 / 3);
    expect(freq.get('cancer')).toBeCloseTo(1 / 3);
  });

  it('returns an empty Map for empty input', () => {
    const freq = createTermFrequency([]);
    expect(freq.size).toBe(0);
  });

  it('never returns NaN or Infinity', () => {
    const freq = createTermFrequency(['risk']);
    for (const value of freq.values()) {
      expect(Number.isNaN(value)).toBe(false);
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('cosineSimilarity', () => {
  it('returns approximately 1 for identical vectors', () => {
    const vector = createTermFrequency(tokenize('risk probability diagnosis cancer'));
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
  });

  it('returns approximately 0 for unrelated vectors', () => {
    const first = createTermFrequency(tokenize('risk probability diagnosis'));
    const second = createTermFrequency(tokenize('patient portal appointment schedule'));
    expect(cosineSimilarity(first, second)).toBeCloseTo(0, 5);
  });

  it('returns 0 when either vector is empty', () => {
    const vector = createTermFrequency(tokenize('risk probability'));
    const empty = createTermFrequency([]);
    expect(cosineSimilarity(vector, empty)).toBe(0);
    expect(cosineSimilarity(empty, vector)).toBe(0);
    expect(cosineSimilarity(empty, empty)).toBe(0);
  });

  it('is never NaN and always stays between 0 and 1', () => {
    const samples: [string, string][] = [
      ['risk probability diagnosis', 'risk probability diagnosis'],
      ['risk probability diagnosis', 'patient portal appointment'],
      ['', 'risk probability'],
      ['risk cancer barrier time cost access fear', 'time barrier follow up appointment'],
    ];

    for (const [a, b] of samples) {
      const score = cosineSimilarity(createTermFrequency(tokenize(a)), createTermFrequency(tokenize(b)));
      expect(Number.isNaN(score)).toBe(false);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
