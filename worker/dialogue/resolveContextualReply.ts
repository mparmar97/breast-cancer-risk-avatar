/**
 * Contextual short-reply resolution against the structured pending conversation item.
 *
 * Distinguishes the same surface form (“yes”, “later”, “explain”) by pending purpose:
 * - comprehension_check → understanding confirmed
 * - information / question about source → provide requested information
 * - single_option / written message → option accepted
 * - proposed_draft → draft accepted
 * - action_commitment → timing/action confirmed
 * - prior assistant offered A or B → bare "yes" needs which-option clarification
 *
 * Exact example sentences belong in tests only. This module uses short-reply
 * category patterns (affirmation/negation/time/elaborate), not full-sentence lists.
 */

import type { PendingConversationItem } from './types';
import {
  mentionsClarifyNumber,
  mentionsPrepareQuestions,
  normalizeUserText,
} from './normalizeUserText';
import { resolveShortReply, type ResolvedShortReply } from './resolveShortReply';

export type ContextualReplyKind =
  | 'understanding_confirmed'
  | 'information_requested'
  | 'option_accepted'
  | 'option_rejected'
  | 'draft_accepted'
  | 'action_confirmed'
  | 'action_deferred'
  | 'elaborate_prior'
  | 'clarification_needed'
  | 'dual_choice_clarification'
  | 'not_contextual'
  | 'unresolved';

export interface ContextualReplyResult extends ResolvedShortReply {
  kind: ContextualReplyKind;
  pendingPurpose?: string;
}

function pendingPurpose(pendingItem?: PendingConversationItem): string {
  const text = `${pendingItem?.text ?? ''} ${pendingItem?.option ?? ''} ${pendingItem?.draftPurpose ?? ''}`.toLowerCase();
  if (pendingItem?.type === 'comprehension_check' || pendingItem?.type === 'teach_back') {
    return 'understanding';
  }
  if (pendingItem?.type === 'proposed_draft') return 'draft_review';
  if (pendingItem?.type === 'single_option') return 'option';
  if (pendingItem?.type === 'action_commitment') return 'planning';
  if (pendingItem?.type === 'multiple_options') return 'multiple_options';
  if (
    pendingItem?.type === 'question' &&
    /\b(source|produced|calculator|how .{0,20}(number|result|estimate)|input|based on)\b/.test(text)
  ) {
    return 'information_source';
  }
  if (pendingItem?.type === 'question') return 'information';
  return pendingItem?.type ?? 'none';
}

/** Detect a prior assistant turn that offered two alternatives joined by "or". */
export function detectDualChoiceOffer(previousAssistantReply?: string | null): {
  isDualChoice: boolean;
  optionA?: string;
  optionB?: string;
} {
  const text = (previousAssistantReply ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { isDualChoice: false };

  // "Would it help to A, or to B?" / "A, or B?"
  const helpMatch = text.match(
    /\b(?:would it help|would you like|do you want|should we)\s+(?:next\s+)?(?:to\s+)?(.+?)\s*,?\s+or\s+(?:to\s+|at\s+)?(.+?)\??\s*$/i,
  );
  if (helpMatch) {
    return {
      isDualChoice: true,
      optionA: helpMatch[1].replace(/[?.!]+$/, '').trim(),
      optionB: helpMatch[2].replace(/[?.!]+$/, '').trim(),
    };
  }

  const looseOr =
    /\b(clarif\w* the number|what the number means|the number itself)\b.+\bor\b.+\b(question|quetsion|prepare|healthcare professional|doctor)\b/i.test(
      text,
    ) ||
    /\b(question|quetsion|prepare).+\bor\b.+\b(clarif\w*|number)\b/i.test(text);
  if (looseOr) {
    return {
      isDualChoice: true,
      optionA: 'clarify the number itself',
      optionB: 'prepare a question for a healthcare professional',
    };
  }

  return { isDualChoice: false };
}

export type DualChoiceSelection = 'clarify_number' | 'prepare_questions' | 'ambiguous';

/**
 * Which side of a number-vs-questions offer the user chose.
 * Tolerates common typos (e.g. quetsion) and "yes prepare…" forms.
 */
export function detectDualChoiceSelection(latestMessage: string): DualChoiceSelection {
  const m = normalizeUserText(latestMessage);
  const wantsQuestions = mentionsPrepareQuestions(m);
  const wantsNumber = mentionsClarifyNumber(m);

  if (wantsQuestions && !wantsNumber) return 'prepare_questions';
  if (wantsNumber && !wantsQuestions) return 'clarify_number';
  if (wantsQuestions && wantsNumber) return 'ambiguous';
  return 'ambiguous';
}

/** Prior assistant asked the user to pick among estimate-focus options. */
export function detectEstimateFocusOffer(previousAssistantReply?: string | null): boolean {
  const text = (previousAssistantReply ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!text) return false;
  const offersMenu =
    (/\b(numbers?|percentage|estimate)\b/.test(text) &&
      /\b(calculat|how (it|they) (was|were)|inputs?)\b/.test(text) &&
      /\bnext steps?\b/.test(text)) ||
    (/\b(which|what) (specific )?part\b/.test(text) &&
      /\b(estimate|result|number)\b/.test(text) &&
      /\bor\b/.test(text));
  return offersMenu;
}

export type EstimateFocusSelection =
  | 'explain_numbers'
  | 'how_calculated'
  | 'next_steps'
  | 'ambiguous';

/** Map a user echo of an estimate-focus menu option. */
export function detectEstimateFocusSelection(latestMessage: string): EstimateFocusSelection {
  const m = normalizeUserText(latestMessage);
  const nextSteps =
    /\bnext steps?\b/.test(m) ||
    /\b(mean|means|meaning).{0,48}next steps?\b/.test(m) ||
    /\bwhat (they|it|this).{0,20}mean for\b/.test(m);
  const numbersThemselves = /\bnumbers? themselves\b/.test(m);
  const calculated =
    /\bcalculat\w*\b/.test(m) ||
    /\b(computed|produced|derived)\b/.test(m) ||
    /\bhow (it|they|this).{0,24}(was|were|is|are) (made|done|calculat\w*)\b/.test(m) ||
    /\binputs?\b/.test(m);
  const numbers =
    numbersThemselves ||
    (/\b(numbers?|percentage|what (the )?(number|estimate|result) means?|explain (the )?(number|estimate|result))\b/.test(
      m,
    ) &&
      !nextSteps &&
      !calculated);

  if (nextSteps && !calculated) return 'next_steps';
  if (calculated && !nextSteps && !numbersThemselves) return 'how_calculated';
  if (numbers && !nextSteps) return 'explain_numbers';
  if (nextSteps) return 'next_steps';
  return 'ambiguous';
}

const CLARIFY_STOP_WORDS = new Set([
  'about',
  'after',
  'affect',
  'could',
  'does',
  'from',
  'have',
  'hoping',
  'into',
  'just',
  'know',
  'like',
  'might',
  'more',
  'overall',
  'something',
  'specific',
  'specifically',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'understand',
  'wanting',
  'what',
  'when',
  'which',
  'with',
  'would',
  'your',
  'youre',
]);

/**
 * Detect when the prior assistant asked "are you wondering X, or …?" / "learn about
 * X — A, B, or something else?" and the user restates a chosen option.
 */
export function detectClarifyingTopicEcho(
  latestMessage: string,
  previousAssistantReply?: string | null,
): { matched: boolean; offeredTopic?: string } {
  const prev = (previousAssistantReply ?? '').replace(/\s+/g, ' ').trim();
  const latest = normalizeUserText(latestMessage);
  if (!prev || !latest) return { matched: false };

  // "what you'd like to learn about the Gail model—its purpose, how it works, or something else?"
  const learnMenu = prev.match(
    /\b(?:like to learn|want to (?:know|learn)|hoping to understand|what aspect).{0,100}(?:—|-|:)\s*(?:its\s+)?([^,?]+),\s*(?:its\s+|how\s+)?([^,?]+),\s*or\b/i,
  );
  if (learnMenu) {
    const optA = normalizeUserText(learnMenu[1] ?? '');
    const optB = normalizeUserText(learnMenu[2] ?? '');
    if (/\bpurpose\b/.test(latest) && /\bpurpose\b/.test(`${optA} ${optB} ${prev}`)) {
      return { matched: true, offeredTopic: 'the purpose of the Gail model' };
    }
    if (
      (/\bhow (it|the).{0,24}works?\b/.test(latest) ||
        /\bestimat/.test(latest) ||
        /\bhow it works\b/.test(latest)) &&
      /\b(works?|estimat)/.test(`${optA} ${optB} ${prev}`)
    ) {
      return { matched: true, offeredTopic: 'how the Gail model works' };
    }
  }

  const wonder = prev.match(
    /\b(?:are you wondering|hoping to understand|would you like to (?:know|understand)|do you mean|what you(?:'re| are) hoping to understand)\b[:\s—-]*(.+?)(?:,?\s+or\b|\?\s*$)/i,
  );
  if (!wonder?.[1]) return { matched: false };

  const offered = normalizeUserText(wonder[1]);
  const offeredTokens = offered
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9']/g, ''))
    .filter((t) => t.length >= 4 && !CLARIFY_STOP_WORDS.has(t));
  if (offeredTokens.length < 2) return { matched: false };

  const latestTokenSet = new Set(
    latest
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9']/g, ''))
      .filter(Boolean),
  );
  const overlap = offeredTokens.filter((t) => latestTokenSet.has(t)).length;
  const needed = Math.min(3, offeredTokens.length);
  if (overlap < needed) return { matched: false };

  return { matched: true, offeredTopic: offered };
}

/**
 * Resolves a short/ambiguous reply against the prior pending item.
 * Does not treat every “yes” as understanding confirmation.
 */
export function resolveContextualReply(
  latestMessage: string,
  pendingItem?: PendingConversationItem,
  previousAssistantReply?: string | null,
): ContextualReplyResult {
  const base = resolveShortReply(latestMessage, pendingItem);
  const purpose = pendingPurpose(pendingItem);
  const dual = detectDualChoiceOffer(previousAssistantReply);
  const selection = detectDualChoiceSelection(latestMessage);
  const inDualChoiceContext = purpose === 'multiple_options' || dual.isDualChoice;
  const estimateFocusOffer = detectEstimateFocusOffer(previousAssistantReply);
  const estimateFocusSelection = detectEstimateFocusSelection(latestMessage);
  const clarifyingEcho = detectClarifyingTopicEcho(latestMessage, previousAssistantReply);

  // User restated the topic from a clarifying "are you wondering X?" offer.
  if (clarifyingEcho.matched) {
    const topic = clarifyingEcho.offeredTopic ?? 'the confirmed topic';
    return {
      ...base,
      isShortReply: true,
      shortReplyType: base.shortReplyType === 'not_short_reply' ? 'affirmation' : base.shortReplyType,
      kind: 'information_requested',
      pendingPurpose: purpose,
      requiresClarification: false,
      overridePrimaryIntent: 'explain_risk',
      resolvedMeaning: `The user confirmed the clarifying topic (${topic}). Answer that topic directly without asking another clarifying question.`,
    };
  }

  // User echoed a prior estimate-focus menu option — advance instead of re-asking.
  if (estimateFocusOffer && estimateFocusSelection === 'next_steps') {
    return {
      ...base,
      isShortReply: true,
      shortReplyType: base.shortReplyType === 'not_short_reply' ? 'affirmation' : base.shortReplyType,
      kind: 'information_requested',
      pendingPurpose: 'multiple_options',
      requiresClarification: false,
      overridePrimaryIntent: 'request_next_step',
      resolvedMeaning:
        'The user chose what the estimate means for next steps. Provide neutral general next-step options.',
    };
  }
  if (estimateFocusOffer && estimateFocusSelection === 'how_calculated') {
    return {
      ...base,
      isShortReply: true,
      shortReplyType: base.shortReplyType === 'not_short_reply' ? 'affirmation' : base.shortReplyType,
      kind: 'information_requested',
      pendingPurpose: 'multiple_options',
      requiresClarification: false,
      overridePrimaryIntent: 'explain_risk',
      resolvedMeaning:
        'The user chose how the estimate was calculated. Explain the calculator inputs and demonstration basis.',
    };
  }
  if (estimateFocusOffer && estimateFocusSelection === 'explain_numbers') {
    return {
      ...base,
      isShortReply: true,
      shortReplyType: base.shortReplyType === 'not_short_reply' ? 'affirmation' : base.shortReplyType,
      kind: 'information_requested',
      pendingPurpose: 'multiple_options',
      requiresClarification: false,
      overridePrimaryIntent: 'explain_risk',
      resolvedMeaning:
        'The user chose clarifying the risk number. Explain the demonstration estimate in plain terms.',
    };
  }

  // User already chose one side of the A-or-B offer — advance the flow.
  if (inDualChoiceContext && selection === 'prepare_questions') {
    return {
      ...base,
      isShortReply: true,
      shortReplyType: base.shortReplyType === 'not_short_reply' ? 'affirmation' : base.shortReplyType,
      kind: 'information_requested',
      pendingPurpose: 'multiple_options',
      requiresClarification: false,
      overridePrimaryIntent: 'request_next_step',
      resolvedMeaning:
        'The user chose preparing questions for a healthcare professional. Provide a short list of general clinician questions.',
    };
  }
  if (inDualChoiceContext && selection === 'clarify_number') {
    return {
      ...base,
      isShortReply: true,
      shortReplyType: base.shortReplyType === 'not_short_reply' ? 'affirmation' : base.shortReplyType,
      kind: 'information_requested',
      pendingPurpose: 'multiple_options',
      requiresClarification: false,
      overridePrimaryIntent: 'explain_risk',
      resolvedMeaning:
        'The user chose clarifying the risk number. Explain the demonstration estimate in plain terms.',
    };
  }

  if (!base.isShortReply) {
    return { ...base, kind: 'not_contextual', pendingPurpose: purpose };
  }

  // Bare "yes" after an A-or-B offer is ambiguous — ask which option.
  if (base.shortReplyType === 'affirmation' && inDualChoiceContext && selection === 'ambiguous') {
    const optionA = dual.optionA ?? 'clarify the number';
    const optionB = dual.optionB ?? 'prepare a question for a healthcare professional';
    return {
      ...base,
      kind: 'dual_choice_clarification',
      pendingPurpose: 'multiple_options',
      requiresClarification: true,
      overridePrimaryIntent: undefined,
      resolvedMeaning: `The user said yes, but the previous turn offered two options (${optionA} vs ${optionB}). Ask which one they want.`,
    };
  }

  if (base.requiresClarification) {
    return { ...base, kind: 'clarification_needed', pendingPurpose: purpose };
  }

  const meaning = (base.resolvedMeaning ?? '').toLowerCase();
  const normalized = latestMessage.trim().toLowerCase();

  if (/^(later|not yet|another day|maybe later)\b/.test(normalized)) {
    return {
      ...base,
      kind: 'action_deferred',
      pendingPurpose: purpose,
      overrideReadiness: 'unclear',
      resolvedMeaning:
        base.resolvedMeaning ??
        'The user is deferring action without rejecting the prior option or draft.',
    };
  }

  if (/^(tell me more|explain( it| that| more)?|go on|more detail)\b/.test(normalized)) {
    return {
      ...base,
      kind: purpose === 'information_source' ? 'information_requested' : 'elaborate_prior',
      pendingPurpose: purpose,
    };
  }

  if (
    base.overridePrimaryIntent === 'explain_risk' &&
    /tell me more|explain|go on|more detail/.test(normalized)
  ) {
    return {
      ...base,
      kind: purpose === 'information_source' ? 'information_requested' : 'elaborate_prior',
      pendingPurpose: purpose,
    };
  }

  if (base.overrideUnderstanding === 'correct' || purpose === 'understanding') {
    if (base.shortReplyType === 'affirmation') {
      return { ...base, kind: 'understanding_confirmed', pendingPurpose: purpose };
    }
  }

  if (purpose === 'information_source' && base.shortReplyType === 'affirmation') {
    return {
      ...base,
      kind: 'information_requested',
      pendingPurpose: purpose,
      overridePrimaryIntent: 'general_question',
      resolvedMeaning:
        'The user affirmed the pending question about how the number/source was produced — provide that information.',
    };
  }

  if (purpose === 'draft_review' && base.shortReplyType === 'affirmation') {
    return { ...base, kind: 'draft_accepted', pendingPurpose: purpose };
  }

  if (purpose === 'option' && base.shortReplyType === 'affirmation') {
    return { ...base, kind: 'option_accepted', pendingPurpose: purpose };
  }

  if (purpose === 'option' && base.shortReplyType === 'negation') {
    return { ...base, kind: 'option_rejected', pendingPurpose: purpose };
  }

  if (
    purpose === 'planning' &&
    (base.shortReplyType === 'affirmation' || base.overridePrimaryIntent === 'confirm_action')
  ) {
    return { ...base, kind: 'action_confirmed', pendingPurpose: purpose };
  }

  if (purpose === 'information' && base.shortReplyType === 'affirmation') {
    return {
      ...base,
      kind: 'information_requested',
      pendingPurpose: purpose,
      resolvedMeaning:
        meaning ||
        'The user affirmed a pending information question — provide the requested information.',
    };
  }

  return { ...base, kind: 'unresolved', pendingPurpose: purpose };
}
