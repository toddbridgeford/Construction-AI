import { SignalTone } from '@/types';

const toneMap: Record<SignalTone, string> = {
  positive: 'text-emerald-200 bg-emerald-400/10',
  neutral: 'text-sky-200 bg-sky-400/10',
  caution: 'text-amber-200 bg-amber-400/10',
  negative: 'text-rose-200 bg-rose-400/10'
};

export function TrendBadge({ value, tone }: { value: string; tone: SignalTone }) {
  return <span className={`rounded-md px-2 py-1 text-[11px] ${toneMap[tone]}`}>{value}</span>;
}
