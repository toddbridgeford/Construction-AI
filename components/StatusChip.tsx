import { SignalTone } from '@/types';

const toneMap: Record<SignalTone, string> = {
  positive: 'text-emerald-200 border-emerald-300/30 bg-emerald-400/10',
  neutral: 'text-sky-200 border-sky-300/30 bg-sky-400/10',
  caution: 'text-amber-200 border-amber-300/30 bg-amber-400/10',
  negative: 'text-rose-200 border-rose-300/30 bg-rose-400/10'
};

export function StatusChip({ tone, text }: { tone: SignalTone; text: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${toneMap[tone]}`}>{text}</span>;
}
