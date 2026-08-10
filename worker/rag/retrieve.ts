import type { DialogueStrategy } from '../behavioral/policy';
import { EVIDENCE_COLLECTION } from './evidence';
import { cosineSimilarity, createTermFrequency, tokenize } from './tokenize';
import type { EvidenceChunk, EvidenceRetriever, EvidenceUse, RetrievedEvidence } from './types';

/**
 * Local, in-memory, deterministic evidence retriever. No network call,
 * external database, or API key is used — retrieval is pure keyword/
 * term-frequency cosine similarity over the static evidence set in
 * worker/rag/evidence.ts. See docs/RAG_ARCHITECTURE.md.
 *
 * Retrieval is scoped by `sourceUse` (default `"medical-rag"`), which is
 * how the medical chat pipeline (worker/index.ts) is kept from ever
 * surfacing a `dialogue-design` chunk as factual/medical support — see
 * `getDialogueDesignEvidence` below for the separate, theory-only path.
 */

interface IndexedEvidence {
  chunk: EvidenceChunk;
  vector: Map<string, number>;
}

// Each chunk's searchable content combines its title, section, topic,
// keywords, and body text, so retrieval can match on any of them (e.g. a
// keyword match even when the exact wording differs from the body text).
function buildSearchableContent(chunk: EvidenceChunk): string {
  return [chunk.title, chunk.section, chunk.topic, chunk.keywords.join(' '), chunk.text].join(' ');
}

// Computed once at module load, since the evidence collection is static.
const EVIDENCE_INDEX: IndexedEvidence[] = EVIDENCE_COLLECTION.map((chunk) => ({
  chunk,
  vector: createTermFrequency(tokenize(buildSearchableContent(chunk))),
}));

// Small, hand-curated query-time expansion for a few morphological
// variants our simple tokenizer can't relate on its own (there is no
// stemming — see docs/RAG_ARCHITECTURE.md). Applied only to the query,
// never to evidence text, so evidence content stays exactly as vetted.
const QUERY_TOKEN_EXPANSIONS: Partial<Record<string, string[]>> = {
  certain: ['certainty'],
};

function expandQueryTokens(tokens: string[]): string[] {
  const expanded = [...tokens];
  for (const token of tokens) {
    const extra = QUERY_TOKEN_EXPANSIONS[token];
    if (extra) {
      expanded.push(...extra);
    }
  }
  return expanded;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 3;
  }
  return Math.min(10, Math.max(1, Math.floor(limit)));
}

export interface RetrieveEvidenceOptions {
  limit?: number;
  sourceUse?: EvidenceUse;
}

/**
 * Retrieves up to `limit` (default 3, clamped to [1, 10]) evidence chunks
 * ranked by cosine similarity to `query`, restricted to `sourceUse`
 * (default `"medical-rag"`). Ties are broken by evidence ID, ascending,
 * so results are fully deterministic. Never mutates the underlying
 * evidence collection, never returns duplicate IDs, and returns an empty
 * array when no matching-use chunk has a positive score.
 */
export function retrieveEvidence(query: string, options: RetrieveEvidenceOptions = {}): RetrievedEvidence[] {
  const { limit = 3, sourceUse = 'medical-rag' } = options;
  const normalizedLimit = normalizeLimit(limit);
  const queryVector = createTermFrequency(expandQueryTokens(tokenize(query)));

  const scored: RetrievedEvidence[] = EVIDENCE_INDEX.filter(({ chunk }) => chunk.sourceUse === sourceUse).map(
    ({ chunk, vector }) => ({
      ...chunk,
      keywords: [...chunk.keywords],
      score: cosineSimilarity(queryVector, vector),
    }),
  );

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.id.localeCompare(b.id);
  });

  const positiveResults = scored.filter((entry) => entry.score > 0);

  return positiveResults.slice(0, normalizedLimit);
}

/**
 * Implements EvidenceRetriever so worker/index.ts (and any future code)
 * can depend only on the interface. Swapping this for a Cloudflare
 * Vectorize-backed retriever later requires no change to the /api/chat
 * contract — see worker/rag/types.ts.
 */
export const localEvidenceRetriever: EvidenceRetriever = {
  retrieve: retrieveEvidence,
};

// Dialogue-design (theory-support) evidence linked to each strategy. Kept
// separate from retrieval scoring — these are fixed, curated associations,
// not similarity-ranked, since the goal is to cite *why* a strategy uses a
// given technique, not to search for relevant text. See
// worker/behavioral/theoryMap.ts for the corresponding theory metadata.
const STRATEGY_DIALOGUE_SOURCE_IDS: Partial<Record<DialogueStrategy, string[]>> = {
  clarify_risk: ['REYNA-FTT-2008', 'WIDMER-TUTORIAL-DIALOGUES-2015'],
  confirm_progress: ['REYNA-FTT-2008', 'WIDMER-TUTORIAL-DIALOGUES-2015'],
  acknowledge_emotion: ['MERCADO-ECA-MI-2023'],
  explore_barrier: ['MERCADO-ECA-MI-2023'],
  support_self_efficacy: ['MERCADO-ECA-MI-2023'],
  action_planning: ['MERCADO-ECA-MI-2023'],
};

/**
 * Returns the dialogue-design evidence chunks associated with a dialogue
 * strategy, for developer diagnostics, theory mapping, and documentation
 * only. These chunks must never be passed to the medical response
 * generator (worker/llm/localGenerator.ts) — see worker/index.ts, which
 * only ever retrieves `sourceUse: "medical-rag"` evidence for reply
 * generation.
 */
export function getDialogueDesignEvidence(strategy: DialogueStrategy): EvidenceChunk[] {
  const sourceIds = new Set(STRATEGY_DIALOGUE_SOURCE_IDS[strategy] ?? []);
  if (sourceIds.size === 0) {
    return [];
  }
  return EVIDENCE_COLLECTION.filter((chunk) => chunk.sourceUse === 'dialogue-design' && sourceIds.has(chunk.sourceId));
}
