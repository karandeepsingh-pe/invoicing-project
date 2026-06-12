import { prisma } from "@/lib/db";
import { ratesForTechnician } from "@/lib/domain/account-rate-resolver";
import { TechnicianCreateDialog } from "./create-dialog";
import {
  TechniciansGrid,
  type RateGroup,
  type RateRow,
  type TechCard,
} from "./technicians-grid";

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export default async function TechniciansPage() {
  const [techs, orgs, accounts] = await Promise.all([
    prisma.technician.findMany({
      include: {
        employerOrg: true,
        postalCode: { select: { zipcode: true, city: true, state: true, country: true } },
        _count: { select: { assignments: true } },
        assignments: {
          where: { endDate: null },
          include: {
            clientAccount: {
              include: {
                org: { select: { name: true, defaultCurrency: true } },
                accountRates: { include: { rateSubCategory: true, sla: true } },
              },
            },
          },
          orderBy: { startDate: "desc" },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.org.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.clientAccount.findMany({
      include: {
        org: { select: { name: true, defaultCurrency: true } },
        accountRates: { include: { rateSubCategory: true, sla: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const today = new Date();

  const cards: TechCard[] = techs.map((t) => {
    const activeGroups: RateGroup[] = t.assignments.map((a) => {
      const rows: RateRow[] = ratesForTechnician(
        a.clientAccount.accountRates,
        a.rateCategory,
        t.band,
        today,
      ).map((r) => ({
        id: r.id,
        subCategoryLabel: r.rateSubCategory.label,
        sla: r.sla.code,
        rateAmount: r.rateAmount ? r.rateAmount.toString() : null,
        effectiveFrom: fmtDate(r.effectiveFrom),
        effectiveTo: r.effectiveTo ? fmtDate(r.effectiveTo) : null,
      }));
      return {
        accountId: a.clientAccount.id,
        orgName: a.clientAccount.org.name,
        accountName: a.clientAccount.name,
        category: a.rateCategory,
        currency: a.clientAccount.currency ?? a.clientAccount.org.defaultCurrency,
        rows,
        kind: "active" as const,
      };
    });

    // Fallback "potential" view when tech has no active assignments.
    // Show what they would inherit at each account at their primary category + band.
    const potentialGroups: RateGroup[] =
      activeGroups.length === 0
        ? accounts
            .map((a): RateGroup | null => {
              const rows: RateRow[] = ratesForTechnician(
                a.accountRates,
                t.primaryCategory,
                t.band,
                today,
              ).map((r) => ({
                id: r.id,
                subCategoryLabel: r.rateSubCategory.label,
                sla: r.sla.code,
                rateAmount: r.rateAmount ? r.rateAmount.toString() : null,
                effectiveFrom: fmtDate(r.effectiveFrom),
                effectiveTo: r.effectiveTo ? fmtDate(r.effectiveTo) : null,
              }));
              if (rows.length === 0) return null;
              return {
                accountId: a.id,
                orgName: a.org.name,
                accountName: a.name,
                category: t.primaryCategory,
                currency: a.currency ?? a.org.defaultCurrency,
                rows,
                kind: "potential",
              };
            })
            .filter((g): g is RateGroup => g !== null)
        : [];

    return {
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      employeeId: t.employeeId,
      primaryCategory: t.primaryCategory,
      band: t.band,
      employerOrgName: t.employerOrg.name,
      active: t.active,
      totalAssignments: t._count.assignments,
      activeAssignmentCount: t.assignments.length,
      rateGroups: [...activeGroups, ...potentialGroups],
      location: t.postalCode
        ? `${t.postalCode.city}, ${t.postalCode.state}, ${t.postalCode.country} · ${t.postalCode.zipcode}`
        : null,
    };
  });

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Workforce</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tighter2 sm:text-4xl">Technicians</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-subtle">{cards.length} total</span>
            <TechnicianCreateDialog
              orgs={orgs}
              accounts={accounts.map((a) => ({
                id: a.id,
                label: `${a.org.name} / ${a.name}`,
              }))}
              existingTechs={techs.map((t) => ({
                firstName: t.firstName,
                lastName: t.lastName,
                employerOrgId: t.employerOrgId,
                employerOrgName: t.employerOrg.name,
                employeeId: t.employeeId,
              }))}
            />
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Field techs assignable to client accounts. The rate sheet on each card is computed
          live from the tech&rsquo;s active assignments at their current band.
        </p>
      </header>

      <TechniciansGrid techs={cards} />
    </div>
  );
}
