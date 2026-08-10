import { CALCULATOR_DISCLAIMER } from './risk/simplifiedGail';
import type { RiskBranch, RiskResult } from './types';

const MOCK_RESULTS: Record<RiskBranch, RiskResult> = {
  average: {
    model: 'Simplified Educational Risk Form (demo scenario)',
    fiveYearRisk: 1.1,
    riskHorizon: '5 years',
    riskBranch: 'average',
    disclaimer: CALCULATOR_DISCLAIMER,
  },
  elevated: {
    model: 'Simplified Educational Risk Form (demo scenario)',
    fiveYearRisk: 3.2,
    riskHorizon: '5 years',
    riskBranch: 'elevated',
    disclaimer: CALCULATOR_DISCLAIMER,
  },
};

export function isRiskBranch(value: unknown): value is RiskBranch {
  return value === 'average' || value === 'elevated';
}

export function getMockRiskResult(scenario: RiskBranch): RiskResult {
  return MOCK_RESULTS[scenario];
}

/** Loose structural guard used to validate a client-supplied risk result. */
export function isRiskResult(value: unknown): value is RiskResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RiskResult>;
  return (
    typeof candidate.model === 'string' &&
    typeof candidate.fiveYearRisk === 'number' &&
    typeof candidate.riskHorizon === 'string' &&
    isRiskBranch(candidate.riskBranch) &&
    typeof candidate.disclaimer === 'string'
  );
}
