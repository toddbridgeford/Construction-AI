export function BottomLinePanel({ text }: { text: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,32,51,0.65),rgba(12,22,38,0.65))] p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Bottom Line</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{text}</p>
    </section>
  );
}
