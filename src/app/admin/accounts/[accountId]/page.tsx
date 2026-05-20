import Link from "next/link";
import { notFound } from "next/navigation";
import { MiscFeeKind, RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isActiveOn } from "@/lib/domain/account-rate-resolver";
import { AccountRateCreateDialog, MiscFeeCreateDialog } from "./create-dialogs";
import { AccountRateRowActions } from "./rate-row-actions";
import { MiscFeeDeleteButton } from "./misc-fee-row-actions";

const categoryOrder: RateCategory[] = [
  RateCategory.DEDICATED,
  RateCategory.PROJECT_TM,
  RateCategory.DISPATCH_SCHED,
];

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

const miscKindLabel: Record<MiscFeeKind, string> = {
  MISCELLANEOUS_PRICES: "Miscellaneous Prices",
  RETAINER_FEES: "Retainer Fees",
  MILEAGE: "Mileage",
  BGV_COST: "BGV Cost",
  PER_DIEM: "Per Diem",
  TOOLKIT: "Toolkit",
  ACCOUNT_SPECIFIC: "Account Specific",
  OTHER: "Other",
};

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function fmtMoney(v: { toString(): string } | null | undefined, currency: string) {
  if (v === null || v === undefined) return "—";
  return `${currency} ${Number(v.toString()).toFixed(4).replace(/\.?0+$/, "")}`;
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;

  const [account, subCategories, slas] = await Promise.all([
    prisma.clientAccount.findUnique({
      where: { id: accountId },
      include: {
        org: true,
        accountRates: {
          include: {
            rateSubCategory: true,
            sla: true,
          },
          orderBy: [
            { rateSubCategory: { rateCategory: "asc" } },
            { rateSubCategory: { sortOrder: "asc" } },
            { band: "asc" },
            { sla: { sortOrder: "asc" } },
            { effectiveFrom: "desc" },
          ],
        },
        miscFees: { orderBy: [{ kind: "asc" }, { createdAt: "desc" }] },
        assignments: { include: { technician: true }, orderBy: { startDate: "desc" } },
      },
    }),
    prisma.rateSubCategory.findMany({ orderBy: [{ rateCategory: "asc" }, { sortOrder: "asc" }] }),
    prisma.sla.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!account) notFound();

  const currency = account.currency ?? account.org.defaultCurrency;
  const today = new Date();

  const ratesByCategory = new Map<RateCategory, typeof account.accountRates>();
  for (const c of categoryOrder) ratesByCategory.set(c, []);
  for (const r of account.accountRates) {
    ratesByCategory.get(r.rateSubCategory.rateCategory)!.push(r);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link
          href={`/admin/orgs/${account.org.id}` as never}
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          ← {account.org.name}
        </Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{account.name}</h1>
        <p className="text-sm text-fg-muted">
          {account.org.outputTemplate} · billing currency {currency}
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Rate sheet</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-subtle">
              {account.accountRates.length} row{account.accountRates.length === 1 ? "" : "s"} total
            </span>
            <AccountRateCreateDialog
              clientAccountId={account.id}
              subCategories={subCategories.map((s) => ({
                id: s.id,
                rateCategory: s.rateCategory,
                code: s.code,
                label: s.label,
              }))}
              slas={slas.map((s) => ({ id: s.id, code: s.code, label: s.label }))}
            />
          </div>
        </div>
        {categoryOrder.map((cat) => {
          const rows = ratesByCategory.get(cat)!;
          return (
            <div
              key={cat}
              className="glass overflow-hidden"
            >
              <div className="flex items-baseline justify-between border-b border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold tracking-tight">
                <span>{categoryLabel[cat]}</span>
                <span className="text-xs font-normal text-fg-subtle">
                  {rows.length} row{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-fg-subtle">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium">Sub-category</th>
                    <th className="px-4 py-2 text-left font-medium">Band</th>
                    <th className="px-4 py-2 text-left font-medium">SLA</th>
                    <th className="px-4 py-2 text-right font-medium">Rate</th>
                    <th className="px-4 py-2 text-left font-medium">Effective from</th>
                    <th className="px-4 py-2 text-left font-medium">Effective to</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const active = isActiveOn(r, today);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-2"
                      >
                        <td className="px-4 py-2.5">{r.rateSubCategory.label}</td>
                        <td className="px-4 py-2.5 text-fg-muted">Band {r.band}</td>
                        <td className="px-4 py-2.5 text-fg-muted">{r.sla.code}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(r.rateAmount, currency)}</td>
                        <td className="px-4 py-2.5 text-fg-muted">{fmtDate(r.effectiveFrom)}</td>
                        <td className="px-4 py-2.5 text-fg-muted">{fmtDate(r.effectiveTo)}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={
                              active
                                ? "inline-flex items-center rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success"
                                : "inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-subtle"
                            }
                          >
                            {active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <AccountRateRowActions id={r.id} currentAmount={r.rateAmount?.toString() ?? ""} />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-3 text-sm text-fg-subtle">
                        No rate rows yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}

      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Miscellaneous fees</h2>
          <MiscFeeCreateDialog clientAccountId={account.id} />
        </div>
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Kind</th>
                <th className="px-4 py-2.5 text-left font-medium">Label</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 text-left font-medium">Notes</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {account.miscFees.map((f) => (
                <tr key={f.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className="px-4 py-2.5">{miscKindLabel[f.kind]}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{f.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(f.amount, currency)}</td>
                  <td className="px-4 py-2.5 text-fg-subtle">{f.notes ?? ""}</td>
                  <td className="px-4 py-2.5 text-right">
                    <MiscFeeDeleteButton id={f.id} />
                  </td>
                </tr>
              ))}
              {account.miscFees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm text-fg-subtle">
                    No misc fees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Assignments</h2>
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Technician</th>
                <th className="px-4 py-2.5 text-left font-medium">Band</th>
                <th className="px-4 py-2.5 text-left font-medium">Category</th>
                <th className="px-4 py-2.5 text-left font-medium">Start</th>
                <th className="px-4 py-2.5 text-left font-medium">End</th>
              </tr>
            </thead>
            <tbody>
              {account.assignments.map((a) => (
                <tr key={a.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <Link className="font-medium text-fg hover:text-accent" href={`/admin/technicians/${a.technician.id}` as never}>
                      {a.technician.firstName} {a.technician.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">Band {a.technician.band}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{categoryLabel[a.rateCategory]}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{fmtDate(a.startDate)}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{fmtDate(a.endDate)}</td>
                </tr>
              ))}
              {account.assignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-fg-subtle">
                    No assignments to this account yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
