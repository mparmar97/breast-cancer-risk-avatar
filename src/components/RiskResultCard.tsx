import type { RiskResult } from '../types';

interface RiskResultCardProps {
  result: RiskResult;
}

export default function RiskResultCard({ result }: RiskResultCardProps) {
  const branchLabel =
    result.riskBranch === 'elevated' ? 'Elevated risk (demo)' : 'Average risk (demo)';

  return (
    <section
      className={`risk-card risk-card--${result.riskBranch}`}
      aria-label="Demonstration risk result"
    >
      <span className={`risk-badge risk-badge--${result.riskBranch}`}>{branchLabel}</span>
      <p className="risk-value">
        {result.fiveYearRisk}%{' '}
        <span className="risk-value-unit">estimated risk over {result.riskHorizon}</span>
      </p>
      <p className="risk-model">Model: {result.model}</p>
      <p className="risk-disclaimer">{result.disclaimer}</p>
    </section>
  );
}
