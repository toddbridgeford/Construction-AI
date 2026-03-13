import { SegmentSignal } from '@/types';

export const segmentSignals: SegmentSignal[] = [
  { segment: 'Housing', signal: 'Mixed / Softening', trend: 'Multifamily cooling; single-family stable', whyItMatters: 'Rate sensitivity remains high; absorption and affordability drive starts.', tone: 'caution' },
  { segment: 'Private nonresidential', signal: 'Moderate Growth', trend: 'Decelerating outside industrial', whyItMatters: 'Pipeline remains active, but feasibility screens are stricter.', tone: 'neutral' },
  { segment: 'Manufacturing', signal: 'Strong', trend: 'Still expanding above cycle trend', whyItMatters: 'Anchors supplier demand and supports regional labor markets.', tone: 'positive' },
  { segment: 'Commercial', signal: 'Soft', trend: 'Office TI uneven; retail selective', whyItMatters: 'Bid competition and tenant uncertainty pressure margins.', tone: 'negative' },
  { segment: 'Public buildings', signal: 'Stable to Firm', trend: 'Supported by appropriated budgets', whyItMatters: 'Provides baseline backlog durability for large contractors.', tone: 'positive' },
  { segment: 'Civil / infrastructure', signal: 'Firm', trend: 'Steady award cadence', whyItMatters: 'Long-cycle projects improve visibility but raise delivery complexity.', tone: 'positive' }
];

export const segmentCommentary = 'Construction is not one market: public/civil and manufacturing remain the most durable pockets, while housing and office-linked commercial stay most exposed to rates and financing conditions.';
