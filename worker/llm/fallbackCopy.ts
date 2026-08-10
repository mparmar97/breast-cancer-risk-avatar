/**
 * Shared local-fallback copy for accurate answers when Groq is unavailable.
 * Category-based wording only — example sentences belong in tests.
 */

import type { RiskResult } from '../types';

export const WHO_TO_CONTACT_FALLBACK =
  'This demonstration cannot name a specific doctor for you. A common starting point is a primary care clinician or gynecologist who can interpret a demonstration risk estimate with a fuller personal and family history and advise whether any specialty referral is appropriate. If you already have a breast clinic or specialist contact, sharing the estimate with that team is also reasonable.';

export const GENERIC_HELPFUL_FALLBACK =
  'I can help explain the demonstration risk estimate, general next-step options, or sample questions for a healthcare professional. What would be most useful right now?';

export const GRATITUDE_FALLBACK =
  'You are welcome. I am glad that helped. If you want to look at another part of the demonstration estimate later, you can ask anytime.';

/**
 * After the user confirms understanding, advance by risk branch instead of
 * repeating the menu or re-explaining the number.
 */
export function understandingNextStepFallback(riskResult?: RiskResult | null): string {
  if (riskResult?.riskBranch === 'elevated') {
    return 'Glad that is clear. A useful next step is to share this demonstration estimate with a healthcare professional who can interpret it with your fuller history — for example at a visit or by a brief message. Would preparing one or two questions for that conversation help?';
  }
  return 'Glad that is clear. For many people with an average-range demonstration estimate, staying with routine screening guidance from a healthcare professional is the usual next focus. Is there anything else about the result you want to clarify?';
}

/** Number-aware risk explanation used when Groq fails. */
export function riskExplanationFallback(riskResult?: RiskResult | null): string {
  const percent = riskResult?.fiveYearRisk;
  const horizonRaw = String(riskResult?.riskHorizon ?? 'five years');
  const horizon = /five|5/i.test(horizonRaw) ? 'five years' : horizonRaw;
  const level = riskResult?.riskLevel ? String(riskResult.riskLevel) : '';
  const levelClause = level
    ? ` The tool labels this demonstration estimate as ${level}, which compares it with the tool's reference level — it still does not diagnose current cancer.`
    : '';

  if (typeof percent === 'number' && Number.isFinite(percent)) {
    return `The about ${percent}% figure means that, based on the calculator inputs used in this demonstration, there is roughly a ${Math.round(percent)}-in-100 chance of developing invasive breast cancer over ${horizon}. It is a probability estimate for people with similar input information, not a diagnosis or a guarantee that cancer will or will not occur.${levelClause}`;
  }

  return `A demonstration risk estimate describes chance over a time period for people with similar calculator information. It is a probability, not a diagnosis or a prediction for one person.${levelClause}`;
}
