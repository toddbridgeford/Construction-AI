export function HeadlinePanel({ headline }: { headline: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-panel">
      <p className="text-xs uppercase tracking-wider text-muted">Main Signal</p>
      <p className="mt-2 text-lg font-medium leading-snug">{headline}</p>
    </section>
  );
}
