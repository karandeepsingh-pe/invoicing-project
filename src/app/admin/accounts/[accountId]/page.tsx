import Link from "next/link";
import { notFound } from "next/navigation";
import { MiscFeeKind, RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AccountRateCreateDialog, MiscFeeCreateDialog } from "./create-dialogs";
import { AccountRateRowActions } from "./rate-row-actions";
import { RateMatrix } from "./rate-matrix";
import { MiscFeeDeleteButton } from "./misc-fee-row-actions";
import { AccountAssignmentCreateDialog } from "./create-assignment-dialog";
import type { TechOption } from "./create-assignment-form";
import { AssignmentsTable } from "./assignments-table";
import { InvoiceRunDeleteButton } from "./invoice-run-actions";
import { ClientAccountEditForm } from "../edit-form";

const invoiceFormatLabel: Record<string, string> = {
  FSO: "FSO",
  PRE_INVOICE: "Pre-Invoice",
};

function monthShort(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

const categoryOrder: RateCategory[] = [
  RateCategory.DEDICATED,
  RateCategory.PROJECT_TM,
  RateCategory.DISPATCH_SCHED,
  RateCategory.SCHEDULED,
];

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

const miscKindLabel: Record<MiscFeeKind, string> = {
  MISCELLANEOUS_PRICES: "Miscellaneous Prices",
  RETAINER_FEES: "Retainer Fees",
  PROJECT_MANAGEMENT: "Project Management (%)",
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

  const [account, subCategories, slas, allTechs] = await Promise.all([
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
        assignments: {
          include: { technician: true },
          orderBy: [
            { technician: { firstName: "asc" } },
            { technician: { lastName: "asc" } },
            { startDate: "desc" },
          ],
        },
        invoiceRuns: {
          orderBy: { generatedAt: "desc" },
          include: { generatedBy: { select: { email: true, name: true } } },
        },
      },
    }),
    prisma.rateSubCategory.findMany({ orderBy: [{ rateCategory: "asc" }, { sortOrder: "asc" }] }),
    prisma.sla.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.technician.findMany({
      where: { active: true },
      include: {
        employerOrg: { select: { name: true } },
        // Active dedication (if any) locks the tech out of new picks.
        assignments: {
          where: { rateCategory: "DEDICATED", endDate: null },
          select: { clientAccountId: true },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);
  if (!account) notFound();

  const currency = account.currency ?? account.org.defaultCurrency;

  const ratesByCategory = new Map<RateCategory, typeof account.accountRates>();
  for (const c of categoryOrder) ratesByCategory.set(c, []);
  for (const r of account.accountRates) {
    ratesByCategory.get(r.rateSubCategory.rateCategory)!.push(r);
  }

  const rateSubCatOptions = subCategories.map((s) => ({
    id: s.id,
    rateCategory: s.rateCategory,
    code: s.code,
    label: s.label,
  }));
  const slaOptions = slas.map((s) => ({ id: s.id, code: s.code, label: s.label }));

  // Matrix inputs: subcategories grouped by category (ordered by sortOrder) and
  // existing rates flattened to natural-key cells.
  const matrixSubCatsByCategory = new Map<
    RateCategory,
    { id: string; code: string; label: string; isOvertimeVariant: boolean }[]
  >();
  for (const c of categoryOrder) matrixSubCatsByCategory.set(c, []);
  for (const s of subCategories) {
    matrixSubCatsByCategory.get(s.rateCategory)?.push({
      id: s.id,
      code: s.code,
      label: s.label,
      isOvertimeVariant: s.isOvertimeVariant,
    });
  }
  const matrixRatesFor = (cat: RateCategory) =>
    (ratesByCategory.get(cat) ?? []).map((r) => ({
      rateSubCategoryId: r.rateSubCategoryId,
      band: r.band,
      slaId: r.slaId,
      rateAmount: r.rateAmount?.toString() ?? null,
    }));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link
          href="/admin/management"
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          ← Client Management
        </Link>
        <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{account.name}</h1>
        <p className="text-sm text-fg-muted">
          {account.org.outputTemplate} · billing currency {currency} · Default Hours{" "}
          {account.defaultHours}
        </p>
        <div className="mt-2 max-w-md">
          <ClientAccountEditForm
            id={account.id}
            name={account.name}
            currency={account.currency}
            orgDefaultCurrency={account.org.defaultCurrency}
            clientPocName={account.clientPocName}
            clientSpocEmail={account.clientSpocEmail}
            projectDescription={account.projectDescription}
            defaultHours={account.defaultHours}
            addressLine1={account.addressLine1}
            city={account.city}
            state={account.state}
            postalCode={account.postalCode}
            country={account.country}
            dispatchPricingModel={account.dispatchPricingModel}
            businessHoursStart={account.businessHoursStart}
            businessHoursEnd={account.businessHoursEnd}
            dedicatedRetainerPerSite={account.dedicatedRetainerPerSite?.toString() ?? null}
            dispatchStandbyPerSite={account.dispatchStandbyPerSite?.toString() ?? null}
          />
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Rate sheet</h2>
          <span className="text-xs text-fg-subtle">
            {account.accountRates.length} row{account.accountRates.length === 1 ? "" : "s"} total
          </span>
        </div>
        {categoryOrder.map((cat) => {
          const rows = ratesByCategory.get(cat)!;
          return (
            <div
              key={cat}
              className="glass overflow-hidden rounded-xl"
            >
              <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold tracking-tight">
                <span>{categoryLabel[cat]}</span>
                <span className="text-xs font-normal text-fg-subtle">
                  {rows.length} row{rows.length === 1 ? "" : "s"} stored
                </span>
              </div>
              <RateMatrix
                clientAccountId={account.id}
                category={cat}
                subCategories={matrixSubCatsByCategory.get(cat)!}
                slas={slaOptions}
                rates={matrixRatesFor(cat)}
              />
              <details className="border-t border-border">
                <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-fg-muted hover:text-fg">
                  Advanced: individual rate rows (add / delete)
                </summary>
                <div className="flex justify-end px-4 py-2">
                  <AccountRateCreateDialog
                    clientAccountId={account.id}
                    subCategories={rateSubCatOptions}
                    slas={slaOptions}
                    lockedCategory={cat}
                  />
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-fg-subtle">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left font-medium">Sub-category</th>
                      <th className="px-4 py-2 text-left font-medium">Band</th>
                      <th className="px-4 py-2 text-left font-medium">SLA</th>
                      <th className="px-4 py-2 text-right font-medium">Rate</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-2"
                      >
                        <td className="px-4 py-2.5">{r.rateSubCategory.label}</td>
                        <td className="px-4 py-2.5 text-fg-muted">Band {r.band}</td>
                        <td className="px-4 py-2.5 text-fg-muted">{r.sla.code}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(r.rateAmount, currency)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <AccountRateRowActions id={r.id} currentAmount={r.rateAmount?.toString() ?? ""} />
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-sm text-fg-subtle">
                          No rate rows yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </details>
            </div>
          );
        })}

      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Miscellaneous fees</h2>
          <MiscFeeCreateDialog clientAccountId={account.id} />
        </div>
        <div className="glass overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-muted">
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
                    <MiscFeeDeleteButton id={f.id} label={f.label} />
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Assignments</h2>
          <div className="flex items-center gap-3">
          <AccountAssignmentCreateDialog
            clientAccountId={account.id}
            accountLabel={`${account.org.name} / ${account.name}`}
            technicians={allTechs.map<TechOption>((t) => ({
              id: t.id,
              firstName: t.firstName,
              lastName: t.lastName,
              employeeId: t.employeeId,
              employerOrgName: t.employerOrg.name,
              primaryAccountName: null,
              band: t.band,
              primaryCategory: t.primaryCategory,
              defaultSlaTier: t.defaultSlaTier,
              flags: {
                isAvailableForDedicated: t.isAvailableForDedicated,
                isAvailableForProject: t.isAvailableForProject,
                isAvailableForDispatch: t.isAvailableForDispatch,
              },
              dedicatedToAccountId: t.assignments[0]?.clientAccountId ?? null,
            }))}
          />
          </div>
        </div>
        <AssignmentsTable
          accountLabel={`${account.org.name} / ${account.name}`}
          rows={account.assignments.map((a) => ({
            id: a.id,
            techId: a.technician.id,
            techName: `${a.technician.firstName} ${a.technician.lastName}`,
            band: a.technician.band,
            categoryLabel: categoryLabel[a.rateCategory],
            startIso: a.startDate.toISOString().slice(0, 10),
            endIso: a.endDate ? a.endDate.toISOString().slice(0, 10) : null,
          }))}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Invoice runs</h2>
          <span className="text-xs text-fg-subtle">
            {account.invoiceRuns.length} run{account.invoiceRuns.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="-mt-1 text-xs text-fg-subtle">
          Audit record written each time a pre-invoice is generated. Delete runs here to
          free the account for deletion.
        </p>
        <div className="glass overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-muted">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Period</th>
                <th className="px-4 py-2.5 text-left font-medium">Format</th>
                <th className="px-4 py-2.5 text-left font-medium">Generated</th>
                <th className="px-4 py-2.5 text-left font-medium">By</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {account.invoiceRuns.map((r) => (
                <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className="px-4 py-2.5">{monthShort(r.periodYear, r.periodMonth)} {r.periodYear}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{invoiceFormatLabel[r.format] ?? r.format}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{fmtDate(r.generatedAt)}</td>
                  <td className="px-4 py-2.5 text-fg-subtle">{r.generatedBy.email}</td>
                  <td className="px-4 py-2.5 text-right">
                    <InvoiceRunDeleteButton
                      id={r.id}
                      label={`${monthShort(r.periodYear, r.periodMonth)} ${r.periodYear}`}
                    />
                  </td>
                </tr>
              ))}
              {account.invoiceRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm text-fg-subtle">
                    No invoice runs yet.
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
