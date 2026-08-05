# RAG Architecture (Phase 4 / 4b)

This document explains the local, transparent Retrieval-Augmented Generation
(RAG) pipeline added in Phase 4, and the medical-rag/dialogue-design source
separation added in Phase 4b (see
[`EVIDENCE_REGISTER.md`](./EVIDENCE_REGISTER.md)). It builds on top of the
Phase 3 adaptive dialogue engine described in
[`ADAPTIVE_STATE_MODEL.md`](./ADAPTIVE_STATE_MODEL.md) and
[`THEORY_DIALOGUE_MAP.md`](./THEORY_DIALOGUE_MAP.md).

## Purpose of RAG in this application

The Phase 3 response generator produced fixed, theory-informed template text
per dialogue strategy, but any *factual* claim inside that text (e.g. "a risk
estimate is not a diagnosis") was hard-coded, not traceably linked to any
specific reference. Phase 4 introduces a small evidence collection and a
retrieval step so that:

- Factual/medical claims can be traced back to a specific evidence chunk
  (`sourceId`, `title`, `organization`, `section`, `topic`).
- The set of claims the assistant is allowed to make is explicit and
  auditable, rather than implicit in template strings.
- The evidence collection can be extended with additional real, vetted
  sources (see [`EVIDENCE_REGISTER.md`](./EVIDENCE_REGISTER.md) and
  [`SOURCE_REPLACEMENT_CHECKLIST.md`](./SOURCE_REPLACEMENT_CHECKLIST.md))
  without changing the dialogue engine, the safety layer, or the API
  contract.

As of Phase 4b, every active evidence chunk is `status: "vetted"` and
traced to one of 10 sources in `worker/rag/sourceRegistry.ts` — see
`EVIDENCE_REGISTER.md`. "Vetted" means the text is traced to a real,
cited source, not that the application has been clinically validated;
human expert review is still required before clinical use.

## Why medical claims should be retrieved from vetted evidence

An LLM-free, template-based generator can still assert an unsupported or
subtly wrong claim if a developer edits a template without realizing its
factual implications. Requiring every factual claim to be *grounded* in a
retrieved evidence chunk with a known topic and source forces a deliberate,
inspectable link between "what we say" and "why we're allowed to say it." It
also makes it straightforward to swap in real clinical sources later: once
`worker/rag/evidence.ts` is replaced with vetted content, the same grounding
logic in `worker/llm/localGenerator.ts` continues to work unchanged.

## Local retrieval architecture

No external database, vector store, or API key is used in this phase.
Retrieval is a small, from-scratch implementation over an in-memory array of
evidence chunks:

1. **Text normalization** (`worker/rag/tokenize.ts` — `normalizeText`):
   lowercases text, replaces hyphens with spaces, strips punctuation (kept:
   letters, numbers, whitespace), collapses repeated whitespace, and trims.
2. **Tokenization** (`tokenize`): splits normalized text on whitespace and
   removes a fixed stop-word list, while explicitly preserving clinically or
   behaviorally meaningful short/common words (e.g. "risk", "cancer", "five",
   "time", "cost", "fear").
3. **Term-frequency representation** (`createTermFrequency`): each token's
   share of the total token count, as a `Map<string, number>`. This is a
   plain term-frequency (TF) vector — there is no inverse-document-frequency
   (IDF) weighting in this phase, since the evidence collection is small and
   hand-curated rather than a large corpus.
4. **Cosine-similarity ranking** (`cosineSimilarity`): compares the query's
   TF vector against each evidence chunk's pre-computed TF vector, clamped to
   `[0, 1]`, with 0 for empty or disjoint vectors.
5. **Top-N retrieval** (`worker/rag/retrieve.ts` — `retrieveEvidence(query,
   options?)`): scores every chunk whose `sourceUse` matches
   `options.sourceUse` (default `"medical-rag"`), sorts by score descending
   (ties broken by ascending evidence ID for determinism), excludes
   zero-score chunks whenever any positive score exists, and returns at
   most `options.limit` results (default 3, clamped to `[1, 10]`).

Each evidence chunk's searchable content combines its `title`, `section`,
`topic`, `keywords`, and `text` (see
`worker/rag/retrieve.ts#buildSearchableContent`), so retrieval can match on
any of those fields — not just the prose body text. A small, explicit
query-time expansion map (`QUERY_TOKEN_EXPANSIONS` in the same file)
additionally relates a handful of query terms to a morphological variant
used in a vetted chunk (currently just `certain` → also matching
`certainty`) — since there is no general stemmer (see Limitations below),
this keeps a few known, important phrasings working without touching
evidence content or the shared tokenizer contract.

## Medical-rag vs. dialogue-design separation

Every evidence chunk has a `sourceUse` of either `"medical-rag"` or
`"dialogue-design"` (`worker/rag/types.ts`):

- **`medical-rag`** chunks may support general medical/risk-calculator
  claims. `POST /api/chat` always calls `retrieveEvidence(query, {
  sourceUse: "medical-rag" })` — this is the **only** evidence the response
  generator (`worker/llm/localGenerator.ts`) ever sees, and the only kind
  ever returned in the API's `sources` field.
- **`dialogue-design`** chunks justify *why* a dialogue strategy uses a
  given behavioral-theory technique (Fuzzy-Trace Theory gist framing,
  teach-back, motivational-interviewing reflection/open questions). They
  are fetched only via `getDialogueDesignEvidence(strategy)`
  (`worker/rag/retrieve.ts`), which is never called from the response
  generator — only from `worker/index.ts` for the developer-only
  `dialogueDesignSources` field, and referenced (as source IDs/citations)
  in `worker/behavioral/theoryMap.ts` for design rationale. They are never
  the factual basis for a diagnosis, treatment, medication, or
  individualized screening/follow-up recommendation.

This separation is enforced structurally (different code paths, not just
a filter the caller might forget) and covered by
`tests/sourceSeparation.test.ts`.

## The retrieval query

`worker/rag/buildQuery.ts#buildRetrievalQuery` builds one normalized query
string per chat turn from:

- the user's latest message (repeated for extra weight, since it usually
  carries the most specific vocabulary),
- the risk branch and risk horizon of the current (demonstration) risk
  result,
- the selected dialogue strategy and a short, strategy-specific concept
  phrase (e.g. `explore_barrier` + `time` adds "time barrier manageable
  action patient portal appointment"),
- the classified understanding state and barrier (when present),
- the safety flag (when present), and
- the selected strategy's theory objective, when it adds useful, non-generic
  vocabulary (skipped for `explore_readiness`, whose objective text mostly
  duplicates the strategy concept and would otherwise dilute short, specific
  messages).

This keeps retrieval relevant even for short or ambiguous user messages,
without inventing or asserting any new diagnostic claim — every added term is
either the message itself or an already-conservative classification label.

## Full pipeline

```
User message
  -> Adaptive-state classifier      (worker/behavioral/localClassifier.ts)
  -> Theory policy                  (worker/behavioral/policy.ts, theoryMap.ts)
  -> Retrieval-query builder        (worker/rag/buildQuery.ts)
  -> Evidence retriever             (worker/rag/retrieve.ts)
  -> Response generator             (worker/llm/localGenerator.ts)
  -> Safety validator               (worker/safety/validateResponse.ts)
  -> User interface                 (src/components/ChatInterface.tsx, DeveloperPanel.tsx)
```

Retrieval and generation always run, even when a fixed safety response will
ultimately be returned (see `worker/index.ts#handleChat`), so the developer
panel can still show which evidence would have been relevant — but the fixed
safety reply itself never depends on retrieval or generation, preserving the
Phase 3 guarantee that safety responses are never influenced by generated
text.

## Separation of behavioral strategy and factual evidence

The adaptive-state classifier and dialogue-strategy selector (Phase 3) decide
*how* to respond (tone, one open-ended question, which barrier to address).
The evidence retriever and response generator (Phase 4) decide *what factual
claim, if any,* is safe to include. These two concerns are intentionally
separate modules with no shared state: `selectDialogueStrategy` never sees
evidence, and `retrieveEvidence` never sees the adaptive state. This means a
later change to the behavioral model doesn't risk silently changing what
medical claims are made, and vice versa.

## Why the LLM should not control risk classification

This prototype deliberately does not let a language model classify risk,
emotional state, or safety flags, nor does it let a model freely generate
factual claims. Classification is deterministic and regex-based (Phase 3);
factual content is retrieved from a fixed, reviewable evidence set and
inserted only through fixed templates gated by evidence topic (Phase 4). This
keeps every possible output enumerable and testable ahead of time, which
matters for a safety-sensitive prototype where an ungrounded or subtly wrong
claim about cancer risk could cause real harm.

## Limitations of keyword and term-frequency retrieval

- **No stemming or lemmatization**: "uncertain" and "uncertainty" are
  different tokens and will not match each other, even though they're
  semantically related.
- **No synonym handling**: a query using different wording than any evidence
  chunk's title/keywords/text may retrieve nothing relevant.
- **No inverse-document-frequency weighting**: a term that appears in many
  evidence chunks is not down-weighted, so very common words can still
  dominate scores in a small corpus.
- **Sensitive to corpus size**: cosine similarity over TF vectors is more
  reliable with a larger, more diverse corpus; the current 17-chunk,
  10-source evidence set (13 medical-rag + 4 dialogue-design) is
  intentionally small.
- **No semantic embeddings**: retrieval is purely lexical (shared tokens),
  not conceptual, so paraphrased questions may retrieve less-relevant
  results than intended.

## Future migration to Cloudflare Vectorize

`worker/rag/types.ts` defines an `EvidenceRetriever` interface with a single
`retrieve(query, options?)` method. `worker/index.ts` depends only on this
interface (via `worker/rag/retrieve.ts#retrieveEvidence`), not on any
implementation detail of the local retriever. A future phase can implement
the same interface backed by Cloudflare Vectorize (embeddings generated via
Workers AI or an external embedding API, stored and queried via a Vectorize
index) and swap it in without changing `worker/index.ts`'s `/api/chat`
contract, the response shape, or the frontend.
