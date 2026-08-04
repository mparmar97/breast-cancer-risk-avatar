// Final safety net applied to every outgoing reply (generated or fixed).
// Rejects wording that would cross into diagnosis, treatment, or an
// unsafe guarantee, regardless of which strategy produced it.
const PROHIBITED_PATTERNS: RegExp[] = [
  // Excludes "...whether you have breast cancer" (used by the diagnosis-request
  // safety disclaimer itself, which explicitly declines to make this claim).
  /(?<!whether )\byou have breast cancer\b/i,
  /\byou do not have breast cancer\b/i,
  /\byou will develop breast cancer\b/i,
  /\byou will not develop breast cancer\b/i,
  /\byou definitely have cancer\b/i,
  /\byou are cancer-free\b/i,
  /\bi prescribe\b/i,
  /\byou should take this medication\b/i,
  /\byou must take\b/i,
  /\bthis guarantees\b/i,
  /\bdefinitely safe\b/i,
];

export const SAFE_FALLBACK_RESPONSE =
  'I cannot safely provide a personalized answer to that question. I can explain the general meaning of the risk result, but a qualified healthcare professional should interpret it for you.';

export function isResponseSafe(response: string): boolean {
  return !PROHIBITED_PATTERNS.some((pattern) => pattern.test(response));
}

/**
 * Validates a candidate reply and returns it unchanged if safe, or the
 * fixed safe fallback if it contains a prohibited diagnostic/treatment
 * claim. This is the last check applied before any reply leaves the
 * worker — see worker/index.ts.
 */
export function validateResponse(response: string): string {
  return isResponseSafe(response) ? response : SAFE_FALLBACK_RESPONSE;
}
