export function TakeawayList({ items }: { items: string[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5">
      <p className="text-xs uppercase tracking-wider text-muted">Key Takeaways</p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
