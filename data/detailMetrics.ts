import { DetailMetric } from '@/types';

export const detailMetrics: DetailMetric[] = [
  {
    id: 'total-spending',
    group: 'Market Activity',
    metric: 'Total Construction Spending',
    latest: '$2.23T SAAR',
    prior: '$2.22T SAAR',
    mom: '+0.3%',
    yoy: '+4.1%',
    interpretation: 'Growth persists, but composition is concentrated in public and industrial segments.',
    sourceFamily: 'Census',
    referencePeriod: 'Jan 2026',
    note: 'Monthly values are seasonally adjusted and subject to revision.',
    trendKey: 'constructionSpending'
  },
  {
    id: 'job-openings',
    group: 'Labor',
    metric: 'Construction Job Openings',
    latest: '306k',
    prior: '318k',
    mom: '-3.8%',
    yoy: '-9.1%',
    interpretation: 'Labor demand is cooling from elevated levels, though skilled categories remain constrained.',
    sourceFamily: 'BLS',
    referencePeriod: 'Jan 2026',
    note: 'Survey-based series can be volatile month to month.'
  },
  {
    id: 'materials',
    group: 'Costs',
    metric: 'Materials Cost Index',
    latest: '218.4',
    prior: '217.3',
    mom: '+0.5%',
    yoy: '+2.8%',
    interpretation: 'Cost pressure has re-accelerated modestly, reducing bid cushion.',
    sourceFamily: 'BLS PPI',
    referencePeriod: 'Feb 2026',
    note: 'Nominal series; interpret against contract structure and escalation clauses.'
  },
  {
    id: 'lending-tone',
    group: 'Financing / Credit',
    metric: 'Bank Construction Lending Tone',
    latest: 'Restrictive',
    prior: 'Restrictive',
    mom: 'No change',
    yoy: 'Tighter',
    interpretation: 'Debt availability remains the primary gating variable for private starts.',
    sourceFamily: 'Fed SLOOS / market proxy',
    referencePeriod: 'Q1 2026',
    trendKey: 'financingStress'
  },
  {
    id: 'abi',
    group: 'Pipeline / Demand',
    metric: 'Architecture Billings Index Proxy',
    latest: '49.6',
    prior: '49.3',
    mom: '+0.3',
    yoy: '-1.1',
    interpretation: 'Forward design demand is near neutral with sector-level divergence.',
    sourceFamily: 'AIA proxy',
    referencePeriod: 'Feb 2026',
    note: 'Read as directional signal rather than direct spending forecast.',
    trendKey: 'segmentMomentum'
  }
];
