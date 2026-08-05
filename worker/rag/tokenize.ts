/**
 * Deterministic text normalization, tokenization, and term-frequency /
 * cosine-similarity utilities used by the local evidence retriever
 * (worker/rag/retrieve.ts). No external library or network call is
 * involved — this is a small, from-scratch keyword/TF-IR implementation
 * suitable for a local, in-memory evidence set.
 */

const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'may',
  'might',
  'my',
  'of',
  'on',
  'or',
  'our',
  'should',
  'so',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

/**
 * Lowercases, replaces hyphens with spaces, strips punctuation (keeping
 * only letters, numbers, and whitespace), collapses repeated whitespace,
 * and trims. E.g. "Five-year risk: 3.2%!" -> "five year risk 3 2".
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes, splits on whitespace, drops stop words and empty tokens. */
export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  return normalized
    .split(' ')
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/**
 * Builds a term-frequency vector: each token's share of the total token
 * count. Always returns a valid Map (empty for empty input), and never
 * NaN/Infinity since the denominator is only used when tokens.length > 0.
 */
export function createTermFrequency(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  if (tokens.length === 0) {
    return frequencies;
  }

  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  const total = tokens.length;
  for (const [token, count] of frequencies) {
    frequencies.set(token, count / total);
  }

  return frequencies;
}

/**
 * Cosine similarity between two term-frequency vectors, clamped to
 * [0, 1]. Returns 0 (never NaN/Infinity) when either vector is empty or
 * when the vectors share no terms.
 */
export function cosineSimilarity(first: Map<string, number>, second: Map<string, number>): number {
  if (first.size === 0 || second.size === 0) {
    return 0;
  }

  let dotProduct = 0;
  for (const [term, value] of first) {
    const otherValue = second.get(term);
    if (otherValue !== undefined) {
      dotProduct += value * otherValue;
    }
  }

  let firstMagnitude = 0;
  for (const value of first.values()) {
    firstMagnitude += value * value;
  }

  let secondMagnitude = 0;
  for (const value of second.values()) {
    secondMagnitude += value * value;
  }

  const denominator = Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude);
  if (denominator === 0) {
    return 0;
  }

  const similarity = dotProduct / denominator;
  // Clamp defensively against floating-point drift (e.g. 1.0000000002).
  return Math.min(1, Math.max(0, similarity));
}
