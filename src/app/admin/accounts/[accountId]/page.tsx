import Link from "next/link";
import { notFound } from "next/navigation";
import { MiscFeeKind, RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isActiveOn } from "@/lib/domain/account-rate-resolver";
import { AccountRateCreateForm } from "./create-rate-form";
import { AccountRateRowActions } from "./rate-row-actions";
import { MiscFeeCreateForm } from "./create-misc-fee-form";
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

  // Group rate rows by category for display.
  const ratesByCategory = new Map<RateCategory, typeof account.accountRates>();
  for (const c of categoryOrder) ratesByCategory.set(c, []);
  for (const r of account.accountRates) {
    ratesByCategory.get(r.rateSubCategory.rateCategory)!.push(r);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/orgs/${account.org.id}` as never} className="text-sm text-neutral-500 underline">
          ← {account.org.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{account.name}</h1>
        <p className="text-sm text-neutral-500">
          {account.org.outputTemplate} · billing currency {currency}
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Rate sheet</h2>
        {categoryOrder.map((cat) => {
          const rows = ratesByCategory.get(cat)!;
          return (
            <div key={cat} className="rounded border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-baseline justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium dark:border-neutral-800 dark:bg-neutral-900">
                <span>{categoryLabel[cat]}</span>
                <span className="text-xs text-neutral-500">{rows.length} row(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Sub-category</th>
                    <th className="px-3 py-2 text-left">Band</th>
                    <th className="px-3 py-2 text-left">SLA</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-left">Effective from</th>
                    <th className="px-3 py-2 text-left">Effective to</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const active = isActiveOn(r, today);
                    return (
                      <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
                        <td className="px-3 py-2">{r.rateSubCategory.label}</td>
                        <td className="px-3 py-2">Band {r.band}</td>
                        <td className="px-3 py-2">{r.sla.code}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(r.rateAmount, currency)}</td>
                        <td className="px-3 py-2">{fmtDate(r.effectiveFrom)}</td>
                        <td className="px-3 py-2">{fmtDate(r.effectiveTo)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              active
                                ? "rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-300"
                                : "rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                            }
                          >
                            {active ? "active" : "inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <AccountRateRowActions id={r.id} currentAmount={r.rateAmount?.toString() ?? ""} />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-3 text-neutral-500">
                        No rate rows yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}

        <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <h3 className="mb-2 text-sm font-semibold">Add rate row</h3>
          <AccountRateCreateForm
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
      </section>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Miscellaneous fees</h2>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {account.miscFees.map((f) => (
              <tr key={f.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">{miscKindLabel[f.kind]}</td>
                <td className="px-3 py-2">{f.label}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(f.amount, currency)}</td>
                <td className="px-3 py-2 text-neutral-500">{f.notes ?? ""}</td>
                <td className="px-3 py-2 text-right">
                  <MiscFeeDeleteButton id={f.id} />
                </td>
              </tr>
            ))}
            {account.miscFees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-neutral-500">
                  No misc fees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Add miscellaneous fee</h3>
          <MiscFeeCreateForm clientAccountId={account.id} />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Assignments</h2>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Technician</th>
              <th className="px-3 py-2 text-left">Band</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Start</th>
              <th className="px-3 py-2 text-left">End</th>
            </tr>
          </thead>
          <tbody>
            {account.assignments.map((a) => (
              <tr key={a.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/admin/technicians/${a.technician.id}` as never}>
                    {a.technician.firstName} {a.technician.lastName}
                  </Link>
                </td>
                <td className="px-3 py-2">Band {a.technician.band}</td>
                <td className="px-3 py-2">{categoryLabel[a.rateCategory]}</td>
                <td className="px-3 py-2">{fmtDate(a.startDate)}</td>
                <td className="px-3 py-2">{fmtDate(a.endDate)}</td>
              </tr>
            ))}
            {account.assignments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-neutral-500">
                  No assignments to this account yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
