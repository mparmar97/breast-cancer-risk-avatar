/**
 * Types for the local, in-memory Retrieval-Augmented Generation (RAG)
 * evidence pipeline. This phase uses only local, deterministic keyword/
 * term-frequency retrieval — no external database, network call, or API
 * key is required. See docs/RAG_ARCHITECTURE.md for the full design.
 */

/**
 * `demo-placeholder` is retained in this type only so validation code
 * (worker/rag/validateEvidence.ts) and tests can positively assert that no
 * *active* evidence chunk uses it. Every currently active chunk in
 * worker/rag/evidence.ts is `"vetted"` and traceable to a real source in
 * worker/rag/sourceRegistry.ts — see docs/EVIDENCE_REGISTER.md.
 */
export type EvidenceStatus = 'demo-placeholder' | 'vetted';

/**
 * `medical-rag` evidence is the only kind ever retrieved by the normal
 * chat pipeline (POST /api/chat) and may support general medical/
 * risk-calculator claims. `dialogue-design` evidence justifies the
 * behavioral-theory and conversational-technique choices in
 * worker/behavioral/theoryMap.ts and is surfaced only in developer
 * diagnostics/documentation — it must never be used as the factual basis
 * for a diagnosis, treatment, medication, or individualized
 * screening/follow-up recommendation.
 */
export type EvidenceUse = 'medical-rag' | 'dialogue-design';

export type EvidenceSourceType =
  | 'official-calculator-documentation'
  | 'government-patient-education'
  | 'clinical-guideline'
  | 'primary-research'
  | 'theory-paper'
  | 'systematic-review';

export interface EvidenceChunk {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  section: string;
  topic: string;
  keywords: string[];
  text: string;
  status: EvidenceStatus;

  sourceUse: EvidenceUse;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;

  /**
   * Present on chunks whose source supports a claim only in a general
   * guideline context — e.g. a screening-age recommendation that must
   * never be turned into an individualized recommendation by this
   * prototype.
   */
  clinicalUseRestriction?: string;

  /**
   * Present on dialogue-design chunks whose supporting study had a scope
   * or population that does not establish clinical effectiveness for
   * this prototype (e.g. a study in a different population, or of a
   * different intervention).
   */
  researchLimitation?: string;
}

export interface RetrievedEvidence extends EvidenceChunk {
  /** Cosine-similarity score against the retrieval query, in [0, 1]. */
  score: number;
}

/**
 * Abstraction over "however evidence is retrieved". The chat pipeline in
 * worker/index.ts depends only on this interface, so the local, in-memory
 * retriever implemented in worker/rag/retrieve.ts can later be swapped for
 * a Cloudflare Vectorize-backed retriever (or any other implementation)
 * without changing the /api/chat contract.
 */
export interface EvidenceRetriever {
  retrieve(query: string, options?: { limit?: number; sourceUse?: EvidenceUse }): RetrievedEvidence[];
}

/** Public, non-sensitive metadata about a retrieved source — safe to send to the client. */
export interface SourceMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  section: string;
  topic: string;
  score: number;
  status: EvidenceStatus;
  sourceUse: EvidenceUse;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  clinicalUseRestriction?: string;
  researchLimitation?: string;
}

export function toSourceMetadata(evidence: RetrievedEvidence): SourceMetadata {
  return {
    id: evidence.id,
    sourceId: evidence.sourceId,
    title: evidence.title,
    organization: evidence.organization,
    section: evidence.section,
    topic: evidence.topic,
    score: evidence.score,
    status: evidence.status,
    sourceUse: evidence.sourceUse,
    sourceType: evidence.sourceType,
    sourceUrl: evidence.sourceUrl,
    publicationDate: evidence.publicationDate,
    accessedDate: evidence.accessedDate,
    citation: evidence.citation,
    clinicalUseRestriction: evidence.clinicalUseRestriction,
    researchLimitation: evidence.researchLimitation,
  };
}

/** Non-sensitive metadata for a dialogue-design (theory-support) chunk, for developer diagnostics only. */
export interface DialogueDesignMetadata {
  id: string;
  sourceId: string;
  title: string;
  organization: string;
  topic: string;
  status: EvidenceStatus;
  sourceType: EvidenceSourceType;
  sourceUrl: string;
  publicationDate?: string;
  accessedDate: string;
  citation: string;
  researchLimitation?: string;
}

export function toDialogueDesignMetadata(chunk: EvidenceChunk): DialogueDesignMetadata {
  return {
    id: chunk.id,
    sourceId: chunk.sourceId,
    title: chunk.title,
    organization: chunk.organization,
    topic: chunk.topic,
    status: chunk.status,
    sourceType: chunk.sourceType,
    sourceUrl: chunk.sourceUrl,
    publicationDate: chunk.publicationDate,
    accessedDate: chunk.accessedDate,
    citation: chunk.citation,
    researchLimitation: chunk.researchLimitation,
  };
}
