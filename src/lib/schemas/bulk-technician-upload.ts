import { z } from "zod";
import { AssignmentSlaTier, RateCategory } from "@prisma/client";

// One row of the bulk-technician-upload spreadsheet. Cells arrive as strings, so
// transforms coerce/normalize here. Mirrors bulk-account-upload.ts.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const emailOrNull = z
  .union([z.string().trim().email(), z.literal("").transform(() => null)])
  .nullable()
  .optional();

// "yes/y/true/1/x" -> true; anything else (incl. blank) -> false.
const boolField = z.preprocess((v) => {
  if (typeof v !== "string") return false;
  return ["yes", "y", "true", "1", "x"].includes(v.trim().toLowerCase());
}, z.boolean());

// Employee ID with placeholder normalization: "NA", "N/A", "-", "NONE" (any case)
// and blanks all mean "no ID" -> null. A literal "NA" must never act as a real ID:
// the Technician unique key is (employerOrgId, employeeId) and Postgres treats
// NULLs as distinct, so placeholder IDs silently bypass duplicate detection.
const EMPLOYEE_ID_PLACEHOLDERS = new Set(["", "NA", "N/A", "-", "NONE", "NIL", "NULL"]);
const employeeIdField = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (EMPLOYEE_ID_PLACEHOLDERS.has(v.toUpperCase()) ? null : v))
  .nullable()
  .optional();

// Optional non-negative money/number cell. Blank -> undefined.
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().nonnegative().max(99_999_999).optional(),
);

const bandField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().min(0).max(4),
);

const categoryField = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toUpperCase().replace(/[\s/&._-]+/g, "_");
  if (["DEDICATED", "FTE", "DEDICATED_FTE"].includes(s)) return "DEDICATED";
  if (["PROJECT", "PROJECT_TM", "PROJECT_T_M", "TM", "T_M"].includes(s)) return "PROJECT_TM";
  if (["DISPATCH", "DISPATCH_SCHED", "DISPATCH_SCHEDULE"].includes(s)) return "DISPATCH_SCHED";
  if (["SCHEDULED", "SCHEDULE", "SCHEDULED_VISIT", "SV"].includes(s)) return "SCHEDULED";
  return s;
}, z.nativeEnum(RateCategory));

const tierField = z.preprocess((v) => {
  if (typeof v !== "string") return "NONE";
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  if (["BACKFILL", "WITH_BACKFILL", "W_BACKFILL"].includes(s)) return "BACKFILL";
  if (["NO_BACKFILL", "WITHOUT_BACKFILL", "WO_BACKFILL", "NO"].includes(s)) return "NO_BACKFILL";
  return "NONE";
}, z.nativeEnum(AssignmentSlaTier));

export const bulkTechnicianRowSchema = z.object({
  orgName: z.string().trim().min(2).max(80),
  employeeId: employeeIdField,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  primaryCategory: categoryField,
  band: bandField,
  defaultSlaTier: tierField,
  isAvailableForDedicated: boolField,
  isAvailableForProject: boolField,
  isAvailableForDispatch: boolField,
  phone: optionalText(40),
  email: emailOrNull,
  annualSalary: optionalNumber,
  isRebadged: boolField,
  rebadgedHourlyRate: optionalNumber,
  rebadgedDayRate: optionalNumber,
  rebadgedMonthlyRate: optionalNumber,
  rebadgedOtRate: optionalNumber,
  rebadgedWeekendRate: optionalNumber,
  zipcode: optionalText(12),
  city: optionalText(80),
  state: optionalText(80),
  country: optionalText(80),
  addressLine1: optionalText(120),
});

export type BulkTechnicianRow = z.infer<typeof bulkTechnicianRowSchema>;

// Column order + header labels for the template and the positional parser.
export const BULK_TECHNICIAN_COLUMNS = [
  { key: "orgName", header: "Employer Org *" },
  { key: "employeeId", header: "Employee ID" },
  { key: "firstName", header: "First Name *" },
  { key: "lastName", header: "Last Name *" },
  { key: "primaryCategory", header: "Primary Category * (Dedicated|Project|Dispatch|Scheduled)" },
  { key: "band", header: "Band * (0-4)" },
  { key: "defaultSlaTier", header: "Backfill Tier (Backfill|No Backfill|blank)" },
  { key: "isAvailableForDedicated", header: "Available Dedicated (yes/no)" },
  { key: "isAvailableForProject", header: "Available Project (yes/no)" },
  { key: "isAvailableForDispatch", header: "Available Dispatch (yes/no)" },
  { key: "phone", header: "Phone" },
  { key: "email", header: "Email" },
  { key: "annualSalary", header: "Annual Salary (billing basis; required for Rebadged)" },
  { key: "isRebadged", header: "Rebadged (yes/no)" },
  { key: "rebadgedHourlyRate", header: "Rebadged Hourly Rate (legacy — not billed, ignored)" },
  { key: "rebadgedDayRate", header: "Rebadged Day Rate (legacy — not billed, ignored)" },
  { key: "rebadgedMonthlyRate", header: "Rebadged Monthly Rate (legacy — not billed, ignored)" },
  { key: "rebadgedOtRate", header: "Rebadged OT Rate / hr" },
  { key: "rebadgedWeekendRate", header: "Rebadged Weekend Rate / hr" },
  { key: "zipcode", header: "Zip / Postal Code" },
  { key: "city", header: "City" },
  { key: "state", header: "State" },
  { key: "country", header: "Country" },
  { key: "addressLine1", header: "Address Line 1" },
] as const;

export type BulkTechnicianColumnKey = (typeof BULK_TECHNICIAN_COLUMNS)[number]["key"];
