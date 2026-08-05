import { EVIDENCE_COLLECTION } from './evidence';
import { SOURCE_REGISTRY } from './sourceRegistry';

/**
 * Structural validation of the static evidence collection and source
 * registry. Purely local — parses URL strings with the built-in `URL`
 * constructor and never makes a network request. Intended to be run in
 * CI/tests (`npm run evidence:check`) so a broken or incomplete evidence
 * edit is caught before deploy, not at runtime.
 */
function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateEvidenceCollection(): string[] {
  const errors: string[] = [];

  const seenSourceIds = new Set<string>();
  for (const source of SOURCE_REGISTRY) {
    if (seenSourceIds.has(source.sourceId)) {
      errors.push(`Duplicate source registry ID: "${source.sourceId}".`);
    }
    seenSourceIds.add(source.sourceId);

    if (!source.sourceUrl) {
      errors.push(`Source "${source.sourceId}" is missing a sourceUrl.`);
    } else if (!isValidHttpUrl(source.sourceUrl)) {
      errors.push(`Source "${source.sourceId}" has an invalid sourceUrl: "${source.sourceUrl}".`);
    }
    if (!source.citation) {
      errors.push(`Source "${source.sourceId}" is missing a citation.`);
    }
    if (!source.organization) {
      errors.push(`Source "${source.sourceId}" is missing an organization.`);
    }
    if (!source.accessedDate) {
      errors.push(`Source "${source.sourceId}" is missing an accessedDate.`);
    }
  }

  const seenChunkIds = new Set<string>();
  for (const chunk of EVIDENCE_COLLECTION) {
    if (seenChunkIds.has(chunk.id)) {
      errors.push(`Duplicate evidence chunk ID: "${chunk.id}".`);
    }
    seenChunkIds.add(chunk.id);

    if (chunk.status !== 'vetted') {
      errors.push(`Evidence chunk "${chunk.id}" has status "${chunk.status}", but only "vetted" chunks may be active.`);
    }
    if (!chunk.sourceId) {
      errors.push(`Evidence chunk "${chunk.id}" is missing a sourceId.`);
    } else if (!seenSourceIds.has(chunk.sourceId)) {
      errors.push(`Evidence chunk "${chunk.id}" references unknown sourceId "${chunk.sourceId}".`);
    }
    if (!chunk.title) {
      errors.push(`Evidence chunk "${chunk.id}" is missing a title.`);
    }
    if (!chunk.organization) {
      errors.push(`Evidence chunk "${chunk.id}" is missing an organization.`);
    }
    if (!chunk.section) {
      errors.push(`Evidence chunk "${chunk.id}" is missing a section.`);
    }
    if (!chunk.topic) {
      errors.push(`Evidence chunk "${chunk.id}" is missing a topic.`);
    }
    if (!chunk.text || chunk.text.trim().length === 0) {
      errors.push(`Evidence chunk "${chunk.id}" is missing text.`);
    }
    if (!chunk.sourceUrl) {
      errors.push(`Evidence chunk "${chunk.id}" is missing a sourceUrl.`);
    } else if (!isValidHttpUrl(chunk.sourceUrl)) {
      errors.push(`Evidence chunk "${chunk.id}" has an invalid sourceUrl: "${chunk.sourceUrl}".`);
    }
    if (!chunk.accessedDate) {
      errors.push(`Evidence chunk "${chunk.id}" is missing an accessedDate.`);
    }
    if (!chunk.citation) {
      errors.push(`Evidence chunk "${chunk.id}" is missing a citation.`);
    }
    if (!chunk.sourceUse) {
      errors.push(`Evidence chunk "${chunk.id}" is missing sourceUse.`);
    }
    if (!chunk.sourceType) {
      errors.push(`Evidence chunk "${chunk.id}" is missing sourceType.`);
    }
  }

  return errors;
}
