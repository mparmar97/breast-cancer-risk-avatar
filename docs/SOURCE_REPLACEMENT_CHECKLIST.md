# Source Replacement Checklist

The initial placeholder-to-vetted-source replacement described by earlier
versions of this document is **complete**: every active chunk in
[`worker/rag/evidence.ts`](../worker/rag/evidence.ts) is now `status:
"vetted"` and traced to one of the 10 sources in
[`worker/rag/sourceRegistry.ts`](../worker/rag/sourceRegistry.ts) — see
[`EVIDENCE_REGISTER.md`](./EVIDENCE_REGISTER.md) for the full register.

Use this checklist whenever adding, replacing, or extending an evidence
source or chunk going forward. Every current source was vetted against
this same list (adapted from the pre-replacement version of this
document) before being added.

## Source-use separation (required)

Every new source must be assigned exactly one `sourceUse`:

- [ ] **`medical-rag`** — only if the source may support a general
      medical/risk-calculator claim delivered by the chat pipeline.
      `medical-rag` sources are the **only** kind ever retrieved by
      `POST /api/chat` (`worker/rag/retrieve.ts` always passes
      `sourceUse: "medical-rag"`).
- [ ] **`dialogue-design`** — for behavioral-theory, teach-back,
      motivational-interviewing, or avatar-dialogue-design sources. These
      justify *technique choices* in `worker/behavioral/theoryMap.ts` and
      appear only in developer diagnostics/documentation
      (`getDialogueDesignEvidence`). They must never become the factual
      basis for a diagnosis, treatment, medication, or individualized
      screening/follow-up recommendation.

## Per-source vetting checklist

For **each** new or replacement source, verify:

- [ ] **Authoritative organization or peer-reviewed publication** — the
      source is published by a recognized medical, governmental, academic,
      or professional body, or appears in a peer-reviewed journal.
- [ ] **Publication or accessed date** — both are known and recorded
      (`publicationDate` if available, `accessedDate` always).
- [ ] **Intended audience matches usage** — it's clear whether the source
      is written for clinicians, patients, or a general audience, and this
      matches how the paraphrase will be used.
- [ ] **Relevance to breast-cancer risk** — the source specifically
      addresses breast-cancer risk assessment, communication, or follow-up
      (or, for `dialogue-design` sources, the specific communication
      technique being justified).
- [ ] **Consistency with the calculator in use** — if the claim concerns
      risk scores, time horizons, or population applicability, it is
      consistent with the mock/demonstration calculator this prototype
      currently uses.
- [ ] **Supported factual claim is explicit** — the specific, narrow claim
      each chunk will support is written down and is directly stated or
      clearly implied by the source, not extrapolated.
- [ ] **No invented content** — chunk `text` is a concise, faithful
      paraphrase, never a long verbatim excerpt and never content the
      source doesn't actually support.
- [ ] **Citation details recorded** — full citation (authors/organization,
      title, publication venue, year) is recorded in
      `worker/rag/sourceRegistry.ts`, not just a URL.
- [ ] **URL recorded and well-formed** — `sourceUrl` is a stable http(s)
      link; `worker/rag/validateEvidence.ts` checks this automatically.
- [ ] **No unsupported clinical recommendation** — the source does not
      contain (and the extracted claim does not imply) a specific
      diagnostic conclusion or treatment recommendation for an individual.
      Guideline-context claims with any risk of being read as
      individualized (e.g. screening-age recommendations) must set
      `clinicalUseRestriction` on the chunk.
- [ ] **Research-scope limitations noted** — if a `dialogue-design` study
      had a scope or population that doesn't establish clinical
      effectiveness for this prototype, set `researchLimitation` on the
      chunk (see `wolfe-brca-gist-001` for an example).
- [ ] **No contradiction with another selected source** — the claim
      doesn't conflict with any other active chunk; if two sources differ,
      note the discrepancy and choose the more authoritative or recent
      one.

## Adding a source and chunk

1. Add an `EvidenceSource` entry to `worker/rag/sourceRegistry.ts` with a
   unique `sourceId`, correct `sourceUse`/`sourceType`, and full citation
   metadata.
2. Add one or more chunk definitions to `worker/rag/evidence.ts`
   referencing that `sourceId`; keep each chunk narrowly focused on one
   claim. The chunk-building helper there throws immediately (fail-fast,
   at load time) if the `sourceId` is unknown or required metadata is
   missing — it will never silently substitute a default.
3. Run `npm run evidence:check` (structural validation +
   medical-rag/dialogue-design separation tests) and `npm test`
   (particularly `tests/retrieval.test.ts`, `tests/vettedRetrieval.test.ts`,
   and `tests/ragApi.test.ts`) to confirm retrieval quality wasn't
   degraded.
4. Update the corresponding table in `EVIDENCE_REGISTER.md`.
5. If the chunk is `dialogue-design` and should back a specific dialogue
   strategy, add its `sourceId` to `STRATEGY_DIALOGUE_SOURCE_IDS` in
   `worker/rag/retrieve.ts` and to the matching entry's `sourceIds` in
   `worker/behavioral/theoryMap.ts`.
6. Have a second reviewer confirm the claim-to-source mapping before
   merging.
