import { KPIGroup, WatchItem } from '@/types';

export const referenceDate = 'March 13, 2026';

export const headline = 'Construction activity is still expanding, but financing friction and cost volatility are limiting conversion from pipeline to starts.';

export const takeaways = [
  'Public and manufacturing-linked activity is offsetting softer private commercial momentum.',
  'Labor tightness has eased from peak stress, but skilled-trade availability still constrains schedule certainty.',
  'Credit conditions remain the primary swing factor for housing and speculative private nonresidential projects.'
];

export const kpiGroups: KPIGroup[] = [
  {
    id: 'market-activity',
    title: 'Market Activity',
    items: [
      { metric: 'Total Construction Spending', latest: '$2.23T SAAR', mom: '+0.3%', yoy: '+4.1%', takeaway: 'Expansion continues, led by public and industrial categories.', tone: 'positive' },
      { metric: 'Residential Spending', latest: '$910B SAAR', mom: '-0.4%', yoy: '+1.2%', takeaway: 'Housing remains rate-sensitive with uneven regional demand.', tone: 'caution' },
      { metric: 'Private Nonresidential Spending', latest: '$690B SAAR', mom: '+0.2%', yoy: '+5.0%', takeaway: 'Still positive but decelerating outside manufacturing.', tone: 'neutral' },
      { metric: 'Public Construction Spending', latest: '$495B SAAR', mom: '+0.6%', yoy: '+7.3%', takeaway: 'Federal and state funding continues to support baseline activity.', tone: 'positive' },
      { metric: 'Manufacturing Construction Spending', latest: '$242B SAAR', mom: '+0.9%', yoy: '+12.8%', takeaway: 'Category remains a major outlier and supports supplier demand.', tone: 'positive' }
    ]
  },
  {
    id: 'labor',
    title: 'Labor',
    items: [
      { metric: 'Construction Employment', latest: '8.29M', mom: '+11k', yoy: '+2.0%', takeaway: 'Payroll growth is still positive but moderating.', tone: 'neutral' },
      { metric: 'Job Openings', latest: '306k', mom: '-12k', yoy: '-9.1%', takeaway: 'Openings are easing, but skilled trades remain tight.', tone: 'caution' },
      { metric: 'Construction Unemployment Rate', latest: '5.2%', mom: '+0.2pp', yoy: '-0.1pp', takeaway: 'Still low versus long-run norms; little slack available.', tone: 'neutral' },
      { metric: 'Wage Growth', latest: '+4.7% YoY', mom: 'flat', yoy: '-0.5pp', takeaway: 'Wage pressure is cooling gradually, not resolved.', tone: 'caution' },
      { metric: 'Labor Availability Signal', latest: 'Constrained', mom: 'No change', yoy: 'Improved', takeaway: 'Capacity risk persists for schedule-critical projects.', tone: 'caution' }
    ]
  },
  {
    id: 'costs',
    title: 'Costs',
    items: [
      { metric: 'Materials Cost Index', latest: '218.4', mom: '+0.5%', yoy: '+2.8%', takeaway: 'Input inflation is re-accelerating from low base.', tone: 'caution' },
      { metric: 'Steel / Copper / Lumber Signal', latest: 'Mixed', mom: 'Copper up', yoy: 'Steel lower', takeaway: 'Procurement strategy matters more than broad hedging.', tone: 'neutral' },
      { metric: 'Diesel / Energy Cost Signal', latest: 'Elevated', mom: '+1.9%', yoy: '+3.4%', takeaway: 'Transport-sensitive trades face renewed pressure.', tone: 'caution' },
      { metric: 'Freight Pressure', latest: 'Moderate', mom: 'No change', yoy: 'Improved', takeaway: 'Freight is no longer a primary bottleneck.', tone: 'neutral' },
      { metric: 'Cost Pressure Composite', latest: '61 / 100', mom: '+2pts', yoy: '-4pts', takeaway: 'Pressure is below peak but trending less favorably.', tone: 'caution' }
    ]
  },
  {
    id: 'financing',
    title: 'Financing / Credit',
    items: [
      { metric: '10Y Treasury', latest: '4.18%', mom: '+18bps', yoy: '+22bps', takeaway: 'Rate drift is tightening feasibility for marginal deals.', tone: 'caution' },
      { metric: 'Credit Spread Proxy', latest: '195bps', mom: '+10bps', yoy: '+24bps', takeaway: 'Risk appetite is selective and less forgiving.', tone: 'caution' },
      { metric: 'Bank Construction Lending Tone', latest: 'Restrictive', mom: 'No change', yoy: 'Tighter', takeaway: 'Debt terms remain the core constraint on starts.', tone: 'negative' },
      { metric: 'CRE Lending Conditions', latest: 'Tight', mom: 'No change', yoy: 'Tight', takeaway: 'Refi and extension pipelines remain active.', tone: 'negative' },
      { metric: 'Refinance / Extension Pressure', latest: 'High', mom: '+1 tier', yoy: '+1 tier', takeaway: 'Maturity walls may force asset-level decisions.', tone: 'negative' }
    ]
  },
  {
    id: 'pipeline',
    title: 'Pipeline / Demand',
    items: [
      { metric: 'Housing Starts', latest: '1.39M SAAR', mom: '-1.4%', yoy: '+0.6%', takeaway: 'Single-family resilient; multifamily normalization continues.', tone: 'caution' },
      { metric: 'Building Permits', latest: '1.47M SAAR', mom: '+0.9%', yoy: '+1.8%', takeaway: 'Permits suggest selective near-term stabilization.', tone: 'neutral' },
      { metric: 'ABI / Backlog Proxy', latest: '49.6', mom: '+0.3', yoy: '-1.1', takeaway: 'Design demand is near neutral, with sector divergence.', tone: 'neutral' },
      { metric: 'Public Funding Pipeline', latest: 'Supportive', mom: 'No change', yoy: 'Stronger', takeaway: 'Funded projects sustain civil and public-building backlog.', tone: 'positive' },
      { metric: 'Federal Award / Procurement Signal', latest: 'Active', mom: '+', yoy: '+', takeaway: 'Award cadence supports medium-term contractor visibility.', tone: 'positive' }
    ]
  },
  {
    id: 'risk',
    title: 'Risk',
    items: [
      { metric: 'Margin Squeeze Risk', latest: 'Moderate-High', mom: 'Worsening', yoy: 'Improved', takeaway: 'Estimate discipline and escalation terms are critical.', tone: 'caution' },
      { metric: 'Bid Pressure', latest: 'High in commercial', mom: 'Rising', yoy: 'Rising', takeaway: 'Competition is compressing risk-adjusted returns.', tone: 'negative' },
      { metric: 'Liquidity Stress', latest: 'Moderate', mom: 'Stable', yoy: 'Higher', takeaway: 'Working-capital planning remains essential.', tone: 'caution' },
      { metric: 'Schedule Risk', latest: 'Elevated', mom: 'No change', yoy: 'Lower', takeaway: 'Labor and permitting still drive completion uncertainty.', tone: 'caution' },
      { metric: 'Regional / Segment Watch', latest: 'Sunbelt housing & urban office TI', mom: 'No change', yoy: 'Broader', takeaway: 'Exposure remains concentrated in rate-sensitive geographies.', tone: 'negative' }
    ]
  }
];

export const watchlist: WatchItem[] = [
  { item: 'Treasury re-pricing above 4.35%', implication: 'Could tighten project debt sizing and delay private starts.', horizon: '30-90 days', tone: 'caution' },
  { item: 'Regional bank CRE reserve build', implication: 'May further constrain refinancing and extensions.', horizon: '30-90 days', tone: 'negative' },
  { item: 'Diesel and power volatility', implication: 'Raises execution risk for logistics and heavy civil.', horizon: '30-60 days', tone: 'caution' },
  { item: 'Skilled-trade absenteeism uptick', implication: 'Could pressure schedule reliability during seasonal ramp.', horizon: '30-90 days', tone: 'caution' }
];

export const bottomLine = 'Base case: broad construction activity stays positive, but returns depend increasingly on financing access, segment selection, and execution discipline. Upside requires rate relief; downside centers on tighter credit and renewed cost pressure.';
