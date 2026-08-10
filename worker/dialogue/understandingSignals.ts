/**
 * Category detectors for user acknowledgments that prior risk explanation
 * was understood. Example sentences belong in tests only.
 */

/** True when the user affirms understanding without asking a new question. */
export function assertsUnderstandingUtterance(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;
  // Short acknowledgments: "okay understood", "understood", "ok got it"
  if (
    /^(okay|ok|alright|all right|yes|yep|yeah)?[,.]?\s*(understood|i understand|got it|gotcha|makes sense|all clear|that helps|clear now)\.?$/i.test(
      text,
    )
  ) {
    return true;
  }
  return /\b(that makes sense|the number makes sense|that is clearer|that'?s clearer|i understand|i get it|i get the result|got it|gotcha|all clear|that helps|clear now|okay understood|ok understood|understand the (result|percentage|number|estimate))\b/i.test(
    text,
  );
}
