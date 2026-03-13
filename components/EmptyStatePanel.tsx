export function EmptyStatePanel({
  title,
  detail
}: {
  title: string;
  detail: string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-white/20 bg-panel/55 p-5">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
    </section>
  );
}
