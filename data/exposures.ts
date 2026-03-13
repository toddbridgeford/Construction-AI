import { ExposureItem, WatchItem } from '@/types';

export const exposures: ExposureItem[] = [
  { area: 'Multifamily development', currentRead: 'Elevated refinance sensitivity', watchpoint: 'Debt-service coverage stress if rates stay high.', tone: 'caution' },
  { area: 'Office TI / urban commercial', currentRead: 'Soft tenant demand in select metros', watchpoint: 'Lease-up pace and sponsor equity support.', tone: 'negative' },
  { area: 'Manufacturing-heavy regions', currentRead: 'Strong activity with concentration risk', watchpoint: 'Policy and capex timing dependence.', tone: 'neutral' },
  { area: 'Civil / infrastructure contractors', currentRead: 'Supportive funded pipeline', watchpoint: 'Execution capacity and working-capital draw.', tone: 'positive' },
  { area: 'Rate-sensitive suburban residential', currentRead: 'Sales pace tied to mortgage volatility', watchpoint: 'Cancellation rates and incentives trend.', tone: 'caution' },
  { area: 'Developer-backed mixed-use', currentRead: 'Selective viability', watchpoint: 'Phase timing, presales, and lender appetite.', tone: 'negative' },
  { area: 'Supplier/manufacturer end-market exposure', currentRead: 'Improving toward public + industrial mix', watchpoint: 'Commercial channel inventory correction.', tone: 'neutral' }
];

export const creditWatch: WatchItem[] = [
  { item: 'Extension requests rising in 2026 maturities', implication: 'Signals persistent refinancing friction across secondary assets.', horizon: '90 days', tone: 'negative' },
  { item: 'Working-capital draws by mid-size contractors', implication: 'May precede covenant pressure in margin-compressed jobs.', horizon: '30-90 days', tone: 'caution' },
  { item: 'Concentration to manufacturing corridors', implication: 'Strong now, but cyclical downside if capex pauses.', horizon: '90 days', tone: 'caution' },
  { item: 'Sponsor support variability', implication: 'Lower-quality sponsors may defer equity commitments.', horizon: '90 days', tone: 'negative' }
];

export const creditBottomLine = 'Credit stance: maintain selective growth in funded public/civil and high-quality industrial exposures, while tightening structure and surveillance in rate-sensitive housing and sponsor-dependent urban commercial assets.';
