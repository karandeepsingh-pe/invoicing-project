export default function BandsMastersPage() {
  const bands = [
    { band: 0, label: "L0 — entry / shadow" },
    { band: 1, label: "L1 — junior" },
    { band: 2, label: "L2 — mid" },
    { band: 3, label: "L3 — senior" },
    { band: 4, label: "L4 — lead / SME" },
  ];

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Masters</span>
        <h1 className="text-4xl font-semibold tracking-tighter2">Bands</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Bands 0–4 are hardcoded into the schema and used on every technician and rate row.
          They are not editable from the UI to keep referential integrity simple. Labels below
          are conventions, not stored in the database.
        </p>
      </header>

      <section className="glass overflow-hidden rounded-lg">
        <table className="w-full text-sm">
          <thead className="glass-header text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Band</th>
              <th className="px-4 py-2.5 text-left font-medium">Convention</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.band} className="border-t border-border/60">
                <td className="px-4 py-2.5 font-mono text-sm font-semibold text-fg">Band {b.band}</td>
                <td className="px-4 py-2.5 text-fg-muted">{b.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="glass rounded-xl p-5 text-sm text-fg-muted">
        Need to add or rename bands? That requires a schema change (Prisma migration) — drop a
        note to engineering. The current range matches the rate matrix structure.
      </div>
    </div>
  );
}
