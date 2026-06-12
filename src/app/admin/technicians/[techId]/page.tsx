import Link from "next/link";
import { notFound } from "next/navigation";
import { RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ratesForTechnician } from "@/lib/domain/account-rate-resolver";
import { type AccountOption } from "./create-assignment-form";
import { AssignmentCreateDialog } from "./create-assignment-dialog";
import { EndAssignmentButton } from "./end-assignment-button";
import { DeleteAssignmentButton } from "./delete-assignment-button";
import { TechnicianEditForm } from "./edit-form";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function fmtMoney(v: { toString(): string } | null | undefined, currency: string) {
  if (v === null || v === undefined) return "—";
  return `${currency} ${Number(v.toString()).toFixed(4).replace(/\.?0+$/, "")}`;
}

export default async function TechnicianDetailPage({
  params,
}: {
  params: Promise<{ techId: string }>;
}) {
  const { techId } = await params;
  const tech = await prisma.technician.findUnique({
    where: { id: techId },
    include: {
      employerOrg: true,
      postalCode: true,
      assignments: {
        include: {
          clientAccount: {
            include: {
              org: true,
              accountRates: { include: { rateSubCategory: true, sla: true } },
            },
          },
        },
        orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
      },
    },
  });
  if (!tech) notFound();

  const orgs = await prisma.org.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const accounts = await prisma.clientAccount.findMany({
    include: {
      org: { select: { name: true, defaultCurrency: true } },
      accountRates: { include: { rateSubCategory: true, sla: true } },
    },
    orderBy: [{ org: { name: "asc" } }, { name: "asc" }],
  });

  const today = new Date();
  const accountOptions: AccountOption[] = accounts.map((a) => {
    const previewByCategory = Object.fromEntries(
      Object.values(RateCategory).map((cat) => [
        cat,
        ratesForTechnician(a.accountRates, cat, tech.band, today).map((r) => ({
          subCategoryLabel: r.rateSubCategory.label,
          sla: r.sla.code,
          rateAmount: r.rateAmount ? r.rateAmount.toString() : null,
        })),
      ]),
    ) as AccountOption["previewByCategory"];
    return {
      id: a.id,
      label: `${a.org.name} / ${a.name}`,
      currency: a.currency ?? a.org.defaultCurrency,
      previewByCategory,
    };
  });

  const activeDedicated = tech.assignments.find(
    (a) => a.rateCategory === RateCategory.DEDICATED && a.endDate === null,
  );

  const activeAssignments = tech.assignments.filter((a) => a.endDate === null);

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <Link href="/admin/management" className="text-xs font-medium text-fg-subtle hover:text-fg">
          ← Client Management
        </Link>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-4xl font-semibold tracking-tighter2">
              {tech.firstName} {tech.lastName}
              {tech.employeeId && (
                <span className="ml-3 align-middle text-sm font-medium text-fg-subtle">
                  #{tech.employeeId}
                </span>
              )}
              {!tech.active && (
                <span className="ml-3 align-middle text-xs font-medium uppercase tracking-wider text-fg-subtle">
                  Inactive
                </span>
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <CategoryPill category={tech.primaryCategory} />
              {tech.isRebadged ? (
                <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Rebadged
                  {tech.annualSalary ? ` · $${Number(tech.annualSalary).toLocaleString()}/yr` : ""}
                </span>
              ) : (
                <BandPill band={tech.band} />
              )}
              {tech.primaryCategory === RateCategory.DEDICATED && tech.defaultSlaTier !== "NONE" && (
                <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg-muted">
                  {tech.defaultSlaTier === "BACKFILL" ? "Backfill" : "No Backfill"}
                </span>
              )}
              <span className="text-fg-subtle">·</span>
              <span>employed by <span className="font-medium text-fg">{tech.employerOrg.name}</span></span>
              {tech.phone && (
                <>
                  <span className="text-fg-subtle">·</span>
                  <span>{tech.phone}</span>
                </>
              )}
              {tech.email && (
                <>
                  <span className="text-fg-subtle">·</span>
                  <span>{tech.email}</span>
                </>
              )}
              {tech.postalCode && (
                <>
                  <span className="text-fg-subtle">·</span>
                  <span>
                    {tech.postalCode.city}, {tech.postalCode.state}, {tech.postalCode.country}
                    <span className="ml-1 text-fg-subtle">· {tech.postalCode.zipcode}</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <TechnicianEditForm
            id={tech.id}
            firstName={tech.firstName}
            lastName={tech.lastName}
            employeeId={tech.employeeId}
            phone={tech.phone}
            email={tech.email}
            primaryCategory={tech.primaryCategory}
            band={tech.band}
            defaultSlaTier={tech.defaultSlaTier}
            dedicatedBillingBasis={tech.dedicatedBillingBasis}
            active={tech.active}
            isAvailableForDedicated={tech.isAvailableForDedicated}
            isAvailableForProject={tech.isAvailableForProject}
            isAvailableForDispatch={tech.isAvailableForDispatch}
            isRebadged={tech.isRebadged}
            annualSalary={tech.annualSalary?.toString() ?? null}
            rebadgedHourlyRate={tech.rebadgedHourlyRate?.toString() ?? null}
            rebadgedDayRate={tech.rebadgedDayRate?.toString() ?? null}
            rebadgedMonthlyRate={tech.rebadgedMonthlyRate?.toString() ?? null}
            rebadgedOtRate={tech.rebadgedOtRate?.toString() ?? null}
            rebadgedWeekendRate={tech.rebadgedWeekendRate?.toString() ?? null}
            employerOrgId={tech.employerOrgId}
            orgs={orgs}
            postalCodeId={tech.postalCodeId}
            addressLine1={tech.addressLine1}
            zipcode={tech.postalCode?.zipcode ?? null}
            city={tech.postalCode?.city ?? null}
            state={tech.postalCode?.state ?? null}
            country={tech.postalCode?.country ?? null}
          />
        </div>
        {activeDedicated && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
            Active DEDICATED assignment at {activeDedicated.clientAccount.org.name} /{" "}
            {activeDedicated.clientAccount.name}. End it before starting a new DEDICATED engagement.
          </div>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tightish">Assignments</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-subtle">
              {tech.assignments.length} total · {activeAssignments.length} active
            </span>
            <AssignmentCreateDialog
              technicianId={tech.id}
              technicianBand={tech.band}
              primaryCategory={tech.primaryCategory}
              defaultSlaTier={tech.defaultSlaTier}
              accounts={accountOptions}
              flags={{
                isAvailableForDedicated: tech.isAvailableForDedicated,
                isAvailableForProject: tech.isAvailableForProject,
                isAvailableForDispatch: tech.isAvailableForDispatch,
              }}
              hasActiveDedication={Boolean(activeDedicated)}
            />
          </div>
        </div>
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-fg-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Account</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-left font-medium">Start</th>
                <th className="px-4 py-2 text-left font-medium">End</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tech.assignments.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <Link className="font-medium text-fg hover:text-accent" href={`/admin/accounts/${a.clientAccount.id}` as never}>
                      {a.clientAccount.org.name} / {a.clientAccount.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">{categoryLabel[a.rateCategory]}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{fmtDate(a.startDate)}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{fmtDate(a.endDate)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {a.endDate === null && <EndAssignmentButton id={a.id} />}
                      <DeleteAssignmentButton
                        id={a.id}
                        accountLabel={`${a.clientAccount.org.name} / ${a.clientAccount.name}`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {tech.assignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-fg-subtle">
                    No assignments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {activeAssignments.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tightish">Effective rates</h2>
            <span className="text-xs text-fg-subtle">
              Inherited from each account · Band {tech.band} · today
            </span>
          </div>
          <div className="flex flex-col gap-4">
            {activeAssignments.map((a) => {
              const rows = ratesForTechnician(
                a.clientAccount.accountRates,
                a.rateCategory,
                tech.band,
                today,
              );
              const currency = a.clientAccount.currency ?? a.clientAccount.org.defaultCurrency;
              return (
                <div
                  key={a.id}
                  className="glass overflow-hidden"
                >
                  <header className="flex items-baseline justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <Link
                        href={`/admin/accounts/${a.clientAccount.id}` as never}
                        className="text-sm font-semibold tracking-tightish text-fg hover:text-accent"
                      >
                        {a.clientAccount.org.name} / {a.clientAccount.name}
                      </Link>
                      <span className="text-xs text-fg-subtle">
                        {categoryLabel[a.rateCategory]} · Band {tech.band} · {currency}
                      </span>
                    </div>
                    <span className="text-xs text-fg-subtle tabular-nums">
                      {rows.length} row{rows.length === 1 ? "" : "s"}
                    </span>
                  </header>
                  {rows.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-fg-muted">
                      No active rate rows for {categoryLabel[a.rateCategory]} at Band {tech.band} on{" "}
                      <Link
                        href={`/admin/accounts/${a.clientAccount.id}` as never}
                        className="text-accent hover:text-accent-hover"
                      >
                        {a.clientAccount.name}
                      </Link>
                      . Add rows on the account&apos;s rate sheet.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wider text-fg-subtle">
                        <tr className="border-b border-border">
                          <th className="px-4 py-2 text-left font-medium">Sub-category</th>
                          <th className="px-4 py-2 text-left font-medium">SLA</th>
                          <th className="px-4 py-2 text-right font-medium">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-b border-border last:border-b-0">
                            <td className="px-4 py-2.5">{r.rateSubCategory.label}</td>
                            <td className="px-4 py-2.5 text-fg-muted">{r.sla.code}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {fmtMoney(r.rateAmount, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}

function CategoryPill({ category }: { category: RateCategory }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
      {categoryLabel[category]}
    </span>
  );
}

function BandPill({ band }: { band: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg-muted">
      Band {band}
    </span>
  );
}
