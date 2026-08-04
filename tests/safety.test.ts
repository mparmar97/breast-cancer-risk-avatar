import { describe, expect, it } from 'vitest';
import { getFixedSafetyResponse } from '../worker/safety/safetyResponses';
import { SAFE_FALLBACK_RESPONSE, isResponseSafe, validateResponse } from '../worker/safety/validateResponse';

describe('validateResponse', () => {
  it.each([
    'You have breast cancer and should see a specialist immediately.',
    'You do not have breast cancer.',
    'You will develop breast cancer within five years.',
    'You will not develop breast cancer.',
    'You definitely have cancer based on this estimate.',
    'You are cancer-free.',
    'I prescribe a daily dose of tamoxifen.',
    'You should take this medication twice a day.',
    'You must take the medication as directed.',
    'This guarantees a good outcome.',
    'This procedure is definitely safe for everyone.',
  ])('rejects a prohibited diagnostic/treatment claim: "%s"', (unsafe) => {
    expect(isResponseSafe(unsafe)).toBe(false);
    expect(validateResponse(unsafe)).toBe(SAFE_FALLBACK_RESPONSE);
  });

  it.each([
    'A risk estimate describes probability over a specified period. It does not mean that you currently have breast cancer.',
    'It sounds like seeing this result has been worrying. A risk estimate is not a diagnosis.',
    'A healthcare professional can interpret the estimate together with your personal and family history.',
    'How do you currently feel about discussing this result with a healthcare professional?',
  ])('accepts safe, educational wording: "%s"', (safe) => {
    expect(isResponseSafe(safe)).toBe(true);
    expect(validateResponse(safe)).toBe(safe);
  });

  it('returns the fixed fallback when validation fails', () => {
    const result = validateResponse('You have breast cancer.');
    expect(result).toBe(SAFE_FALLBACK_RESPONSE);
  });
});

describe('getFixedSafetyResponse', () => {
  it('returns a fixed response for each safety flag', () => {
    expect(getFixedSafetyResponse('diagnosis_request')).toMatch(/not a diagnosis/i);
    expect(getFixedSafetyResponse('treatment_request')).toMatch(/cannot recommend/i);
    expect(getFixedSafetyResponse('urgent_symptom')).toMatch(/cannot evaluate urgent symptoms/i);
    expect(getFixedSafetyResponse('emotional_crisis')).toMatch(/crisis/i);
    expect(getFixedSafetyResponse('out_of_scope')).toMatch(/cannot answer that/i);
  });

  it('returns null when no safety condition applies', () => {
    expect(getFixedSafetyResponse('none')).toBeNull();
  });

  it('never includes a telephone number', () => {
    const phonePattern = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{3}\b/;
    for (const flag of [
      'diagnosis_request',
      'treatment_request',
      'urgent_symptom',
      'emotional_crisis',
      'out_of_scope',
    ] as const) {
      const response = getFixedSafetyResponse(flag);
      expect(response).not.toBeNull();
      expect(response ?? '').not.toMatch(phonePattern);
    }
  });
});
