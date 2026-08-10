/**
 * Shared closing / farewell detection for short social wrap-ups.
 * Exact example sentences belong in tests only.
 */

import { normalizeUserText } from './normalizeUserText';

const FAREWELL_PATTERN =
  /\b(see you( later| soon| tomorrow)?|goodbye|good bye|bye bye|bye|talk( to you)? later|catch you later|have a (nice|good) (day|night|one))\b/;

/** "take care" alone or after thanks — not "take care of my health". */
const TAKE_CARE_CLOSING_PATTERN =
  /\b(thanks|thank you|thx).{0,40}\btake care\b|\btake care\s*$/;

const THANKS_RESOLUTION_PATTERN =
  /\b(thanks|thank you|thx|appreciate( it| that)?).{0,60}(answers|answered|helps|helped|clarifies|clarified|that'?s all|that is all|i'?m done|im done|no (more|further) questions)\b/;

const DONE_ALONE_PATTERN =
  /\b(i'?m done|im done|that'?s all( for now)?|that is all( for now)?|no (more|further) questions)\b/;

/** Bare thanks / appreciation without an explicit farewell. */
export function isGratitudeUtterance(message: string): boolean {
  // Avoid dictionary correction turning "thank you" into "thanks you".
  const normalized = normalizeUserText(message, { dictionaryCorrect: false });
  if (!normalized) return false;
  return /^(ok(ay)?[,.]?\s*)?(thanks|thank you|thanks you|thx|appreciate (it|that))[.!]*$/.test(
    normalized,
  );
}

/** True when the user is wrapping up or saying goodbye. */
export function isClosingUtterance(message: string): boolean {
  const normalized = normalizeUserText(message);
  if (!normalized) return false;
  return (
    FAREWELL_PATTERN.test(normalized) ||
    TAKE_CARE_CLOSING_PATTERN.test(normalized) ||
    THANKS_RESOLUTION_PATTERN.test(normalized) ||
    DONE_ALONE_PATTERN.test(normalized)
  );
}
