export function DashboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="mb-1 border-b border-white/10 pb-4">
      <h2 className="text-xl font-semibold tracking-tight text-ink md:text-2xl">{title}</h2>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted">{subtitle}</p>
    </section>
  );
}
