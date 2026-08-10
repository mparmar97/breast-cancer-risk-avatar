import type { RiskBranch, RiskResult } from '../types';

/**
 * Simplified educational risk estimate inspired by Gail-model *inputs*
 * (age, menarche, first live birth, family history, biopsies, atypical hyperplasia).
 *
 * This is NOT the NCI BCRAT / Gail algorithm, is not validated for clinical use,
 * and must never be presented as a medical calculation.
 */

export type MenarcheBand = '<12' | '12-13' | '>=14';
export type FirstBirthBand = 'never' | '<20' | '20-24' | '25-29' | '>=30';
export type YesNoUnknown = 'yes' | 'no' | 'unknown';

export interface CalculatorInputs {
  age: number;
  ageAtMenarche: MenarcheBand;
  ageAtFirstLiveBirth: FirstBirthBand;
  /** First-degree relatives with breast cancer (capped at 2+). */
  firstDegreeRelatives: 0 | 1 | 2;
  /** Prior breast biopsies (capped at 2+). */
  priorBiopsies: 0 | 1 | 2;
  atypicalHyperplasia: YesNoUnknown;
}

export const CALCULATOR_DISCLAIMER =
  'Educational demonstration estimate only. This simplified form is inspired by Gail-model input categories but is not the NCI BCRAT calculator and is not a validated medical calculation.';

/** Common chemoprevention / counseling threshold often cited with Gail 5-year risk. */
export const ELEVATED_FIVE_YEAR_THRESHOLD = 1.67;

const MODEL_NAME = 'Simplified Educational Risk Form (Gail-inspired inputs)';

export function isCalculatorInputs(value: unknown): value is CalculatorInputs {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<CalculatorInputs>;
  return (
    typeof c.age === 'number' &&
    Number.isFinite(c.age) &&
    c.age >= 35 &&
    c.age <= 85 &&
    (c.ageAtMenarche === '<12' || c.ageAtMenarche === '12-13' || c.ageAtMenarche === '>=14') &&
    (c.ageAtFirstLiveBirth === 'never' ||
      c.ageAtFirstLiveBirth === '<20' ||
      c.ageAtFirstLiveBirth === '20-24' ||
      c.ageAtFirstLiveBirth === '25-29' ||
      c.ageAtFirstLiveBirth === '>=30') &&
    (c.firstDegreeRelatives === 0 || c.firstDegreeRelatives === 1 || c.firstDegreeRelatives === 2) &&
    (c.priorBiopsies === 0 || c.priorBiopsies === 1 || c.priorBiopsies === 2) &&
    (c.atypicalHyperplasia === 'yes' ||
      c.atypicalHyperplasia === 'no' ||
      c.atypicalHyperplasia === 'unknown')
  );
}

function ageContribution(age: number): number {
  if (age < 40) return 0.05;
  if (age < 50) return 0.35;
  if (age < 60) return 0.65;
  if (age < 70) return 0.95;
  return 1.15;
}

function scoreInputs(inputs: CalculatorInputs): number {
  let score = ageContribution(inputs.age);
  score += inputs.ageAtMenarche === '<12' ? 0.4 : inputs.ageAtMenarche === '12-13' ? 0.2 : 0;
  score +=
    inputs.ageAtFirstLiveBirth === 'never'
      ? 0.5
      : inputs.ageAtFirstLiveBirth === '<20'
        ? 0
        : inputs.ageAtFirstLiveBirth === '20-24'
          ? 0.15
          : inputs.ageAtFirstLiveBirth === '25-29'
            ? 0.3
            : 0.45;
  score += inputs.firstDegreeRelatives === 0 ? 0 : inputs.firstDegreeRelatives === 1 ? 0.85 : 1.45;
  score += inputs.priorBiopsies === 0 ? 0 : inputs.priorBiopsies === 1 ? 0.35 : 0.7;
  score += inputs.atypicalHyperplasia === 'yes' ? 0.95 : 0;
  return score;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function computeEducationalRisk(inputs: CalculatorInputs): RiskResult {
  const score = scoreInputs(inputs);
  // Map a compact score onto a plausible educational 5-year percentage band.
  const fiveYearRisk = Math.round(clamp(0.7 + score * 0.75, 0.4, 7.5) * 10) / 10;
  const riskBranch: RiskBranch =
    fiveYearRisk >= ELEVATED_FIVE_YEAR_THRESHOLD ? 'elevated' : 'average';

  return {
    model: MODEL_NAME,
    fiveYearRisk,
    riskHorizon: '5 years',
    riskBranch,
    disclaimer: CALCULATOR_DISCLAIMER,
    calculatorInputs: inputs,
  };
}
