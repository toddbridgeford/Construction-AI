import { AudienceFrame } from '@/data/audienceModes';

export function ExecutiveBriefBand({
  title,
  signal,
  framing,
  bottomLine
}: {
  title: string;
  signal: string;
  framing: AudienceFrame;
  bottomLine: string;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(14,24,40,0.95),rgba(11,18,32,0.95))] p-6 shadow-panel md:p-8">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted/90">Executive Brief</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-[2rem]">{title}</h1>
      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-ink/95">{signal}</p>
      <ul className="mt-5 grid gap-2 md:grid-cols-3">
        {framing.briefBullets.map((bullet) => (
          <li key={bullet} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-muted">
            {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-5 rounded-2xl border border-accent/25 bg-accent/[0.08] p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-accent/90">{framing.bottomLineLead}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{bottomLine}</p>
      </div>
    </section>
  );
}
