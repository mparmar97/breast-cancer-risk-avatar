/**
 * Deterministic conversion of a percentage risk into an approximate
 * natural-frequency framing (people out of N). Rounding is intentional and
 * must be described as approximate — never exact.
 */

export interface NaturalFrequencyResult {
  originalRiskPercent: number;
  /** Alias of originalRiskPercent. */
  originalPercent: number;
  numerator: number;
  denominator: number;
  timeHorizon?: string;
  approximationText: string;
  /** Alias of approximationText. */
  approximationLabel: string;
  /** True when nearest-integer rounding was applied. */
  rounded: boolean;
}

export interface ConvertRiskToNaturalFrequencyInput {
  riskPercent: number;
  denominator?: number;
  timeHorizon?: string;
}

/**
 * Converts a percentage risk into "about X out of N" using nearest-integer
 * rounding of (percent / 100) * denominator.
 */
export function convertRiskToNaturalFrequency(
  input: ConvertRiskToNaturalFrequencyInput,
): NaturalFrequencyResult {
  const denominator = input.denominator && input.denominator > 0 ? Math.round(input.denominator) : 100;
  const proportion = input.riskPercent / 100;
  const exact = proportion * denominator;
  let numerator = Math.round(exact);
  if (input.riskPercent > 0 && numerator === 0) {
    numerator = 1;
  }
  const approximationText = `about ${numerator} out of ${denominator}`;
  return {
    originalRiskPercent: input.riskPercent,
    originalPercent: input.riskPercent,
    numerator,
    denominator,
    timeHorizon: input.timeHorizon,
    approximationText,
    approximationLabel: approximationText,
    rounded: Math.abs(exact - numerator) > 1e-9 || (input.riskPercent > 0 && Math.round(exact) === 0),
  };
}
