import { prisma } from "@/lib/db";
import { HolidayCreateDialog } from "./create-dialog";
import { HolidayRowActions } from "./holiday-row";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function weekday(d: Date): string {
  return d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" });
}

export default async function HolidaysMastersPage() {
  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Masters</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tighter2">Holidays</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-subtle">{holidays.length} total</span>
            <HolidayCreateDialog />
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Gazetted public holidays (global). Each date auto-fills PH on every technician&apos;s
          Dedicated timesheet for that month (overridable), and a PH day bills as a paid day.
        </p>
      </header>

      <section className="glass overflow-hidden rounded-lg">
        <table className="w-full text-sm">
          <thead className="glass-header text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-left font-medium">Day</th>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id} className="border-t border-border/60 transition-colors hover:bg-surface/40">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-fg">{fmt(h.date)}</td>
                <td className="px-4 py-2.5 text-fg-muted">{weekday(h.date)}</td>
                <td className="px-4 py-2.5 text-fg-muted">{h.name}</td>
                <td className="px-4 py-2.5">
                  <HolidayRowActions id={h.id} date={fmt(h.date)} name={h.name} />
                </td>
              </tr>
            ))}
            {holidays.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-sm text-fg-subtle">
                  No holidays yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
