import type { Barrier, Intent, Readiness, SelfEfficacy, Understanding } from '../behavioral/state';
import type { PendingConversationItem, ShortReplyType } from './types';

/**
 * Deterministic, regex-based short-reply resolution (Section 2's "obvious
 * short affirmations or negations" exact-pattern allowance). This module
 * intentionally does NOT depend on Groq — it must work identically whether
 * the current turn's interpretation came from Groq or the local fallback
 * classifier, and it is what makes "yes"/"no"/"tonight" behave consistently
 * regardless of provider availability.
 *
 * A short reply is only ever resolved against the previous assistant turn's
 * {@link PendingConversationItem}. If no pending item was recorded (the
 * previous assistant turn was a statement, not a question or offer), a bare
 * "yes"/"no" is deliberately left ambiguous — the caller must ask a useful
 * clarification rather than inventing a plan.
 */

const AFFIRMATION_PATTERN =
  /^(yes|yeah|yep|yup|sure|okay|ok|of course|definitely|absolutely|that works|that would work|that sounds good|i can do that|sounds good|works for me|i think so|i guess so|i suppose so)\b/;

/** Affirmations that specifically confirm a prior explanation made sense. */
const COMPREHENSION_AFFIRMATION_PATTERN =
  /^(yes(\s+it\s+does)?|yeah|yep|yup|sure|okay|ok|got it|that makes sense|that is clearer|that's clearer|that is clear|that's clear|now i understand|i understand|i see|okay i see|ok i see|that helped|that helps|clearer now)[.!]*$/;

const NEGATION_PATTERN =
  /^(no|nope|nah|not really|not particularly|not exactly|i do not think so|i don't think so|i dont think so|not at all)\b/;

const STILL_CONFUSED_PATTERN =
  /\b(still confused|still unclear|don't understand|do not understand|dont understand|doesn't make sense|does not make sense|not clear|more confused)\b/;

/** Pure short uncertainty only — not "I do not know what to write" style requests. */
const UNCERTAIN_PATTERN =
  /^(maybe|perhaps|i do not know|i don't know|i dont know|idk|not sure|possibly|kind of|sort of|i am not sure|i'm not sure)[.!]*$/;

const EXPLANATION_REQUEST_PATTERN =
  /^(tell me more|explain( it| that| more)?|why|how|what does that mean|go on|more detail|more information)[.?!]*$/;

const TIME_ANSWER_PATTERN =
  /\b(tonight|today|tomorrow|this evening|this weekend|after work|next week|later today|in a few days|this afternoon)\b/;

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text: string): number {
  return text.length === 0 ? 0 : text.split(' ').length;
}

export interface ResolvedShortReply {
  isShortReply: boolean;
  shortReplyType: ShortReplyType;
  resolvedMeaning?: string;
  overridePrimaryIntent?: Intent;
  overrideUnderstanding?: Understanding;
  overrideSelfEfficacy?: SelfEfficacy;
  overrideReadiness?: Readiness;
  overrideBarrier?: Barrier;
  /** True when the reply is short but there is not enough context to safely resolve it — the caller must ask, not assume. */
  requiresClarification: boolean;
}

const SHORT_REPLY_MAX_WORDS = 8;

function pendingLabel(pendingItem?: PendingConversationItem): string {
  return pendingItem?.text ?? pendingItem?.option ?? 'the previous question';
}

function isComprehensionAffirmation(normalized: string): boolean {
  return AFFIRMATION_PATTERN.test(normalized) || COMPREHENSION_AFFIRMATION_PATTERN.test(normalized);
}

/**
 * Resolves a (possibly short/ambiguous) latest user message against the
 * previous assistant turn's pending item. Returns `isShortReply: false`
 * immediately for anything that isn't recognizably short — such messages
 * are left entirely to the normal current-turn interpretation.
 */
export function resolveShortReply(latestMessage: string, pendingItem?: PendingConversationItem): ResolvedShortReply {
  const normalized = normalize(latestMessage);
  const words = wordCount(normalized);

  const isAffirmation = AFFIRMATION_PATTERN.test(normalized) || COMPREHENSION_AFFIRMATION_PATTERN.test(normalized);
  const isNegation = !isAffirmation && NEGATION_PATTERN.test(normalized);
  const isUncertain = !isAffirmation && !isNegation && UNCERTAIN_PATTERN.test(normalized);
  const isExplanationRequest = EXPLANATION_REQUEST_PATTERN.test(normalized);
  const isTimeAnswer = !isAffirmation && !isNegation && !isUncertain && words <= SHORT_REPLY_MAX_WORDS && TIME_ANSWER_PATTERN.test(normalized);

  const isShortReply = isAffirmation || isNegation || isUncertain || isExplanationRequest || isTimeAnswer;

  let shortReplyType: ShortReplyType = 'not_short_reply';
  if (isAffirmation) shortReplyType = 'affirmation';
  else if (isNegation) shortReplyType = 'negation';
  else if (isUncertain) shortReplyType = 'uncertain_reply';

  if (!isShortReply) {
    return { isShortReply: false, shortReplyType: 'not_short_reply', requiresClarification: false };
  }

  const hasPendingItem = Boolean(pendingItem && pendingItem.type !== 'none');

  // Explanation requests ("tell me more", "why", "how") always refer back
  // to whatever the previous assistant turn just said or offered.
  if (isExplanationRequest) {
    if (!hasPendingItem) {
      return {
        isShortReply: true,
        shortReplyType,
        requiresClarification: true,
        resolvedMeaning: 'The user wants more explanation, but no specific prior topic was recorded to expand on.',
      };
    }
    return {
      isShortReply: true,
      shortReplyType,
      overridePrimaryIntent: 'explain_risk',
      requiresClarification: false,
      resolvedMeaning: `The user wants more explanation of: ${pendingLabel(pendingItem)}.`,
    };
  }

  // A bare time answer ("tonight") only makes sense as a reply to a
  // pending action-planning question — otherwise there is nothing to
  // schedule and the reply is left ambiguous.
  if (isTimeAnswer) {
    if (!hasPendingItem) {
      return { isShortReply: true, shortReplyType, requiresClarification: true };
    }
    return {
      isShortReply: true,
      shortReplyType,
      overridePrimaryIntent: 'confirm_action',
      overrideReadiness: 'ready',
      requiresClarification: false,
      resolvedMeaning: `The user committed to a timeframe ("${normalized}") for: ${pendingLabel(pendingItem)}.`,
    };
  }

  // No clear question or offer was pending — do not invent a plan from a
  // bare "yes"/"no"/"maybe" (Section 7's "time appears to be the obstacle" example).
  if (!hasPendingItem) {
    return {
      isShortReply: true,
      shortReplyType,
      overridePrimaryIntent: 'unclear',
      requiresClarification: true,
      resolvedMeaning: 'The user gave a short reply, but no specific question or option was pending to resolve it against.',
    };
  }

  if (isAffirmation) {
    // Affirmative reply to a comprehension check: the prior explanation helped.
    if (pendingItem?.type === 'comprehension_check') {
      return {
        isShortReply: true,
        shortReplyType,
        overridePrimaryIntent: 'confirm_understanding',
        overrideUnderstanding: 'correct',
        requiresClarification: false,
        resolvedMeaning: 'The user confirms that the previous explanation was understood.',
      };
    }

    // Affirmative reply to a proposed draft — accept/confirm the draft.
    if (pendingItem?.type === 'proposed_draft') {
      return {
        isShortReply: true,
        shortReplyType,
        overridePrimaryIntent: 'confirm_proposed_action',
        overrideReadiness: 'preparing',
        requiresClarification: false,
        resolvedMeaning: 'The user accepts or plans to use the proposed draft wording.',
      };
    }

    // Affirmative reply to an offered teach-back exercise.
    if (pendingItem?.type === 'teach_back') {
      return {
        isShortReply: true,
        shortReplyType,
        overridePrimaryIntent: 'accept_teach_back',
        requiresClarification: false,
        resolvedMeaning: `The user agreed to try a teach-back: ${pendingLabel(pendingItem)}.`,
      };
    }

    if (pendingItem?.type === 'single_option') {
      return {
        isShortReply: true,
        shortReplyType,
        overridePrimaryIntent: 'express_confidence',
        overrideSelfEfficacy: 'moderate',
        overrideReadiness: 'preparing',
        overrideBarrier: 'none',
        requiresClarification: false,
        resolvedMeaning: `${pendingLabel(pendingItem)} feels manageable.`,
      };
    }
    if (pendingItem?.type === 'action_commitment') {
      return {
        isShortReply: true,
        shortReplyType,
        overridePrimaryIntent: 'confirm_action',
        overrideReadiness: 'ready',
        requiresClarification: false,
        resolvedMeaning: `The user confirmed: ${pendingLabel(pendingItem)}.`,
      };
    }
    if (pendingItem?.type === 'multiple_options') {
      return {
        isShortReply: true,
        shortReplyType,
        requiresClarification: true,
        resolvedMeaning: 'The user affirmed, but more than one option was offered — which one is unclear.',
      };
    }
    if (pendingItem?.expectedReplyType === 'affirmation' && isComprehensionAffirmation(normalized)) {
      const text = (pendingItem.text ?? pendingItem.option ?? '').toLowerCase();
      if (
        /\b(clarif|make sense|clearer|understand|explanation|out.of.100|five.year|probability|diagnosis)\b/.test(
          text,
        )
      ) {
        return {
          isShortReply: true,
          shortReplyType,
          overridePrimaryIntent: 'confirm_understanding',
          overrideUnderstanding: 'correct',
          requiresClarification: false,
          resolvedMeaning: 'The user confirms that the previous explanation was understood.',
        };
      }
    }

    return {
      isShortReply: true,
      shortReplyType,
      overridePrimaryIntent: 'affirmation',
      requiresClarification: false,
      resolvedMeaning: `Yes, in answer to: ${pendingLabel(pendingItem)}.`,
    };
  }

  if (isNegation) {
    // Negation after a comprehension check: the explanation did not help.
    if (pendingItem?.type === 'comprehension_check' || STILL_CONFUSED_PATTERN.test(normalized)) {
      if (pendingItem?.type === 'comprehension_check') {
        return {
          isShortReply: true,
          shortReplyType,
          overridePrimaryIntent: 'explain_risk',
          overrideUnderstanding: 'uncertain',
          requiresClarification: false,
          resolvedMeaning: 'The user is still confused after the previous explanation.',
        };
      }
    }

    return {
      isShortReply: true,
      shortReplyType,
      overridePrimaryIntent: 'negation',
      requiresClarification: false,
      resolvedMeaning: `No, in answer to: ${pendingLabel(pendingItem)}.`,
    };
  }

  // isUncertain
  if (pendingItem?.type === 'comprehension_check') {
    return {
      isShortReply: true,
      shortReplyType,
      overridePrimaryIntent: 'explain_risk',
      overrideUnderstanding: 'uncertain',
      requiresClarification: false,
      resolvedMeaning: 'The user is uncertain whether the previous explanation helped.',
    };
  }

  return {
    isShortReply: true,
    shortReplyType,
    overridePrimaryIntent: 'unclear',
    requiresClarification: true,
    resolvedMeaning: `The user is uncertain in response to: ${pendingLabel(pendingItem)}.`,
  };
}
