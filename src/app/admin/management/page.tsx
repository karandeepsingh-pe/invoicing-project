import { prisma } from "@/lib/db";
import { ManagementView, type OrgRow } from "./management-view";
import { OrgCreateDialog } from "@/app/admin/orgs/create-dialog";
import { BulkUploadDialog as AccountBulkUploadDialog } from "@/app/admin/accounts/bulk-upload-dialog";
import { TechnicianBulkUploadDialog } from "@/app/admin/technicians/bulk-upload-dialog";
import type { TechOption } from "@/app/admin/accounts/[accountId]/create-assignment-form";

export default async function ManagementPage() {
  // Active = not yet ended as of today. An ended assignment no longer attaches
  // the technician to the account.
  const today = new Date();
  const data = await prisma.org.findMany({
    orderBy: { name: "asc" },
    include: {
      clientAccounts: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              accountRates: true,
              miscFees: true,
              assignments: true,
              invoiceRuns: true,
            },
          },
          assignments: {
            where: { OR: [{ endDate: null }, { endDate: { gte: today } }] },
            orderBy: [
              { technician: { lastName: "asc" } },
              { technician: { firstName: "asc" } },
            ],
            include: {
              technician: {
                select: { id: true, firstName: true, lastName: true, band: true },
              },
            },
          },
        },
      },
      technicians: {
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          _count: { select: { assignments: true } },
          postalCode: { select: { zipcode: true, city: true, state: true, country: true } },
        },
      },
    },
  });

  // Pool for the per-account "Assign" dialog. The form's eligibility filter
  // (pool flag + active-dedication lockout) is account-independent, so one shared
  // list serves every account's dialog. Mirrors accounts/[accountId]/page.tsx.
  const allTechs = await prisma.technician.findMany({
    where: { active: true },
    include: {
      employerOrg: { select: { name: true } },
      assignments: {
        where: { rateCategory: "DEDICATED", endDate: null },
        select: { clientAccountId: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const techOptions: TechOption[] = allTechs.map((t) => ({
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
  }));

  const orgs: OrgRow[] = data.map((o) => ({
    id: o.id,
    name: o.name,
    outputTemplate: o.outputTemplate,
    defaultCurrency: o.defaultCurrency,
    accounts: o.clientAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency ?? o.defaultCurrency,
      rateCount: a._count.accountRates,
      miscCount: a._count.miscFees,
      assignmentCount: a._count.assignments,
      invoiceRunCount: a._count.invoiceRuns,
      assignedTechs: a.assignments.map((asg) => ({
        id: asg.technician.id,
        name: `${asg.technician.firstName} ${asg.technician.lastName}`,
        band: asg.technician.band,
        category: asg.rateCategory,
      })),
    })),
    technicians: o.technicians.map((t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      employeeId: t.employeeId,
      primaryCategory: t.primaryCategory,
      band: t.band,
      isRebadged: t.isRebadged,
      assignmentCount: t._count.assignments,
      location: t.postalCode
        ? `${t.postalCode.city}, ${t.postalCode.state}, ${t.postalCode.country} · ${t.postalCode.zipcode}`
        : null,
    })),
  }));

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Client Management
        </span>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tighter2">Orgs · Accounts · Technicians</h1>
          <div className="flex flex-wrap items-center gap-2">
            <AccountBulkUploadDialog />
            <TechnicianBulkUploadDialog />
            <OrgCreateDialog />
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Single workspace for vendor orgs, their client accounts, rate sheets, and technicians.
          Create, edit, and delete from here — changes propagate everywhere the data is used.
          Open an account to manage rate cards, misc fees, and assignments; open a technician to
          manage their employment and assignments.
        </p>
      </header>

      <ManagementView orgs={orgs} techOptions={techOptions} />
    </div>
  );
}
