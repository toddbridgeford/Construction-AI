import { SignalTone } from '@/types';

export const toneClasses: Record<SignalTone, string> = {
  positive: 'text-positive border-positive/40 bg-positive/10',
  neutral: 'text-accent border-accent/40 bg-accent/10',
  caution: 'text-caution border-caution/40 bg-caution/10',
  negative: 'text-negative border-negative/40 bg-negative/10'
};
