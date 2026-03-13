import { AudienceMode } from '@/types';

export const audienceModes: AudienceMode[] = [
  'Lender / Investor',
  'Contractor',
  'Owner / Developer',
  'Manufacturer / Supplier',
  'Public Sector'
];

export interface AudienceFrame {
  heading: string;
  watchLabel: string;
  soWhat: string;
  briefBullets: string[];
  bottomLineLead: string;
}

export const audienceFraming: Record<AudienceMode, AudienceFrame> = {
  'Lender / Investor': {
    heading: 'Credit durability remains mixed as private demand bifurcates.',
    watchLabel: '90-Day Credit Watch',
    soWhat: 'Protect downside in rate-sensitive housing and sponsor-backed mixed-use while selectively supporting infrastructure and manufacturing-adjacent credits.',
    briefBullets: [
      'Prioritize covenant quality over nominal growth in private development exposure.',
      'Treat manufacturing concentration as supportive but not cycle-proof.',
      'Expect extension risk to stay elevated where take-out financing is uncertain.'
    ],
    bottomLineLead: 'Portfolio implication:'
  },
  Contractor: {
    heading: 'Backlog is stable, but bid pressure is rising in commercial and housing-adjacent work.',
    watchLabel: '90-Day Execution Watch',
    soWhat: 'Prioritize trade mix and change-order discipline where labor tightness and financing delays threaten margin conversion.',
    briefBullets: [
      'Bid quality matters more than volume in soft commercial channels.',
      'Keep crew allocation flexible across public and industrial opportunities.',
      'Lock procurement timing where energy-sensitive inputs are re-firming.'
    ],
    bottomLineLead: 'Operating implication:'
  },
  'Owner / Developer': {
    heading: 'Feasibility is improving selectively as financing remains the main gating factor.',
    watchLabel: '90-Day Feasibility Watch',
    soWhat: 'Sequence starts toward funded segments and defer optional phases where absorption and debt pricing are still uncertain.',
    briefBullets: [
      'Use phase-gating to preserve optionality in rate-sensitive markets.',
      'Underwrite lease-up and absorption more conservatively in urban mixed-use.',
      'Preserve contingency for schedule risk tied to labor and permitting.'
    ],
    bottomLineLead: 'Development implication:'
  },
  'Manufacturer / Supplier': {
    heading: 'Demand mix favors infrastructure and advanced manufacturing over office-linked channels.',
    watchLabel: '90-Day Demand Mix Watch',
    soWhat: 'Reallocate inventory and sales focus toward resilient public and industrial end markets while guarding against commercial softness.',
    briefBullets: [
      'Shift account coverage toward civil and plant-adjacent projects.',
      'Watch distributor inventory in office-sensitive product lines.',
      'Match production cadence to award timing, not headline starts alone.'
    ],
    bottomLineLead: 'Commercial implication:'
  },
  'Public Sector': {
    heading: 'Public and civil programs remain supportive but delivery risk is rising.',
    watchLabel: '90-Day Delivery Watch',
    soWhat: 'Advance procurement cadence and contractor capacity checks to preserve schedule certainty on funded projects.',
    briefBullets: [
      'Front-load procurement validation for long-lead materials.',
      'Screen contractor working-capital resilience before award.',
      'Use packaging strategies that match regional labor depth.'
    ],
    bottomLineLead: 'Delivery implication:'
  }
};
