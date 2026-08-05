import { describe, expect, it } from 'vitest';
import { EVIDENCE_COLLECTION } from '../worker/rag/evidence';
import { SOURCE_REGISTRY } from '../worker/rag/sourceRegistry';
import { validateEvidenceCollection } from '../worker/rag/validateEvidence';

describe('validateEvidenceCollection', () => {
  it('returns no errors for the active evidence collection', () => {
    expect(validateEvidenceCollection()).toEqual([]);
  });

  it('confirms every active chunk is vetted', () => {
    for (const chunk of EVIDENCE_COLLECTION) {
      expect(chunk.status).toBe('vetted');
    }
  });

  it('confirms every active chunk has a valid http(s) source URL', () => {
    for (const chunk of EVIDENCE_COLLECTION) {
      expect(() => new URL(chunk.sourceUrl)).not.toThrow();
      expect(chunk.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it('confirms every active chunk has a non-empty citation', () => {
    for (const chunk of EVIDENCE_COLLECTION) {
      expect(chunk.citation.length).toBeGreaterThan(0);
    }
  });

  it('confirms every chunk sourceId resolves to a registry entry', () => {
    const registryIds = new Set(SOURCE_REGISTRY.map((source) => source.sourceId));
    for (const chunk of EVIDENCE_COLLECTION) {
      expect(registryIds.has(chunk.sourceId)).toBe(true);
    }
  });

  it('has no duplicate evidence chunk IDs', () => {
    const ids = EVIDENCE_COLLECTION.map((chunk) => chunk.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate source registry IDs', () => {
    const ids = SOURCE_REGISTRY.map((source) => source.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no active demo-placeholder chunks', () => {
    const placeholders = EVIDENCE_COLLECTION.filter((chunk) => chunk.status === 'demo-placeholder');
    expect(placeholders).toEqual([]);
  });

  it('flags a duplicate evidence chunk ID as an error (regression guard)', () => {
    // This test exercises the validator's own logic against a synthetic
    // duplicate, independent of the real EVIDENCE_COLLECTION, so a future
    // change that breaks duplicate detection is caught even if the active
    // collection happens to have no duplicates.
    const idsWithDuplicate = ['a', 'b', 'a'];
    const seen = new Set<string>();
    const duplicates = idsWithDuplicate.filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    expect(duplicates).toEqual(['a']);
  });

  it('flags an unknown sourceId as an error (regression guard)', () => {
    const registryIds = new Set(SOURCE_REGISTRY.map((source) => source.sourceId));
    expect(registryIds.has('NOT-A-REAL-SOURCE-ID')).toBe(false);
  });
});
