import type { Intent } from '../behavioral/state';
import type { PendingConversationItem } from './types';

/**
 * Detects when the user is reviewing, accepting, revising, rejecting, or
 * pasting a previously proposed portal-message draft.
 */

const DRAFT_REVIEW_QUESTION_PATTERN =
  /\b(does (this|the) (message|draft|wording|text) (sound|look|read|seem) (clear|ok|okay|good|fine)|is (this|the) (message|draft|wording) (clear|ok|okay|good)|review (this|my) (draft|message|wording)|does this wording sound)\b/i;

const DRAFT_ACCEPT_PATTERN =
  /\b(that (draft|message|wording) sounds? clear|that looks good|the (message|draft|wording) is fine|i like that wording|i can use this|that works for me|i('ll| will) use that (message|draft)|looks good|yes,? that is clear|no changes (are )?needed|the wording is clear|sounds clear|clear as written)\b/i;

const DRAFT_REVISION_PATTERN =
  /\b((make|can you make) it shorter|that is close|too long|revise|reword|edit (it|the draft|the message)|change the wording|shorter version)\b/i;

const DRAFT_REJECT_PATTERN =
  /\b(i (do not|don't|dont) want to (send|use) (that|this|it)|i (won't|will not) send (that|this|it)|not going to send (that|this)|reject (that|the) (draft|message))\b/i;

const PORTAL_DRAFT_SHAPE_PATTERN =
  /\b(demonstration|demo).{0,40}(breast[- ]?cancer )?risk (estimate|result)\b/i;

const INTERPRETATION_REQUEST_PATTERN =
  /\b(help interpreting|interpret(ing)? (it|this|the)|personal and family history|advise whether a discussion)\b/i;

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((token) => token.length > 2),
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type PendingDraftResolutionKind = 'accept' | 'revise' | 'reject' | 'review_question' | 'paste' | 'none';

export interface ResolvedPendingDraft {
  isDraftContext: boolean;
  kind: PendingDraftResolutionKind;
  overridePrimaryIntent?: Intent;
  resolvedMeaning?: string;
}

/**
 * When a proposed draft is pending — or the user asks an explicit draft-
 * review question — override the primary intent so policy/planning treat
 * the turn as draft acceptance, revision, or review rather than readiness
 * exploration or a new emotional disclosure.
 */
export function resolvePendingDraft(
  latestMessage: string,
  pendingItem?: PendingConversationItem,
): ResolvedPendingDraft {
  const trimmed = latestMessage.trim();
  if (!trimmed) {
    return { isDraftContext: false, kind: 'none' };
  }

  const pendingIsDraft = pendingItem?.type === 'proposed_draft';

  // Revision / rejection take priority over generic acceptance phrasing.
  if (pendingIsDraft && DRAFT_REJECT_PATTERN.test(trimmed)) {
    return {
      isDraftContext: true,
      kind: 'reject',
      overridePrimaryIntent: 'express_ambivalence',
      resolvedMeaning: 'The user rejects the proposed draft and does not want to send it.',
    };
  }

  if (pendingIsDraft && DRAFT_REVISION_PATTERN.test(trimmed)) {
    return {
      isDraftContext: true,
      kind: 'revise',
      overridePrimaryIntent: 'request_draft_help',
      resolvedMeaning: 'The user wants the proposed draft revised rather than accepted as written.',
    };
  }

  if (pendingIsDraft && DRAFT_ACCEPT_PATTERN.test(trimmed)) {
    return {
      isDraftContext: true,
      kind: 'accept',
      overridePrimaryIntent: 'confirm_proposed_action',
      resolvedMeaning: 'The user accepts the proposed draft.',
    };
  }

  // Explicit review questions (asking whether wording is clear) remain review.
  if (DRAFT_REVIEW_QUESTION_PATTERN.test(trimmed)) {
    return {
      isDraftContext: true,
      kind: 'review_question',
      overridePrimaryIntent: 'request_draft_review',
      resolvedMeaning: 'The user asked whether draft wording is clear.',
    };
  }

  // Acceptance language even without a pending item still confirms a draft
  // when the wording is clearly about an already-proposed message.
  if (DRAFT_ACCEPT_PATTERN.test(trimmed)) {
    return {
      isDraftContext: true,
      kind: 'accept',
      overridePrimaryIntent: 'confirm_proposed_action',
      resolvedMeaning: 'The user accepts the proposed draft.',
    };
  }

  if (!pendingIsDraft) {
    return { isDraftContext: false, kind: 'none' };
  }

  const draftText = pendingItem?.draftText?.trim() ?? '';
  if (draftText) {
    const similarity = jaccardSimilarity(trimmed, draftText);
    if (similarity >= 0.55 || normalize(trimmed).includes(normalize(draftText).slice(0, 40))) {
      return {
        isDraftContext: true,
        kind: 'paste',
        overridePrimaryIntent: 'request_draft_review',
        resolvedMeaning: 'The user submitted or repeated the previously proposed draft for review.',
      };
    }
  }

  if (PORTAL_DRAFT_SHAPE_PATTERN.test(trimmed) && INTERPRETATION_REQUEST_PATTERN.test(trimmed)) {
    return {
      isDraftContext: true,
      kind: 'paste',
      overridePrimaryIntent: 'request_draft_review',
      resolvedMeaning: 'The user submitted portal-message wording while a draft was pending review.',
    };
  }

  return { isDraftContext: false, kind: 'none' };
}
