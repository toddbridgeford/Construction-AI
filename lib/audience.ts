import { audienceFraming, type AudienceFrame } from '@/data/audienceModes';
import { AudienceMode, WatchItem } from '@/types';

const overlays: Record<AudienceMode, string[]> = {
  'Lender / Investor': ['Credit downside', 'Refinance stress', 'Loss-given-default drift', 'Collateral durability'],
  Contractor: ['Bid discipline', 'Backlog conversion', 'Crew productivity', 'Working-capital usage'],
  'Owner / Developer': ['Capital stack certainty', 'Lease-up pacing', 'Phase timing', 'Absorption variance'],
  'Manufacturer / Supplier': ['End-market mix', 'Order visibility', 'Inventory risk', 'Channel pricing'],
  'Public Sector': ['Procurement cadence', 'Contractor capacity', 'Award-to-start lag', 'Delivery continuity']
};

const fallbackFrame: AudienceFrame = {
  heading: 'Conditions are mixed across construction segments.',
  watchLabel: '90-Day Watch',
  soWhat: 'Prioritize funded projects, protect downside, and update assumptions as new data arrives.',
  briefBullets: [
    'Use segment-level reads instead of one-market assumptions.',
    'Separate near-term noise from trend persistence.',
    'Treat all forecasts as conditional on financing and costs.'
  ],
  bottomLineLead: 'Decision implication:'
};

export function getAudienceFrame(mode: AudienceMode): AudienceFrame {
  return audienceFraming[mode] ?? fallbackFrame;
}

export function frameWatchlistForAudience(items: WatchItem[], mode: AudienceMode): WatchItem[] {
  if (!items.length) {
    return [];
  }

  return items.map((item, index) => ({
    ...item,
    item: `${overlays[mode]?.[index] ?? 'Watch'}: ${item.item}`
  }));
}
