import { z } from "zod";
import { OutputTemplate } from "@prisma/client";

// One row of the bulk-account-upload spreadsheet. Cells arrive as strings (the
// parser stringifies every cell), so transforms coerce/normalize here.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const currencyOptional = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD)")
  .optional()
  .or(z.literal("").transform(() => undefined));

const emailOrEmpty = z
  .union([z.string().trim().email(), z.literal("").transform(() => null)])
  .nullable()
  .optional();

// Empty cell -> undefined -> default 8; otherwise coerce + bound.
const defaultHoursField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().min(1).max(24).default(8),
);

// Accepts FSO / PRE_INVOICE / PRE-INVOICE (any case). Blank -> undefined (only
// required when an org has to be auto-created).
const outputTemplateOptional = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toUpperCase().replace(/[-\s]+/g, "_");
  return s.length === 0 ? undefined : s;
}, z.nativeEnum(OutputTemplate).optional());

export const bulkAccountRowSchema = z.object({
  orgName: z.string().trim().min(2).max(80),
  outputTemplate: outputTemplateOptional,
  orgCurrency: currencyOptional,
  accountName: z.string().trim().min(1).max(120),
  accountCurrency: currencyOptional,
  clientPocName: optionalText(120),
  clientSpocEmail: emailOrEmpty,
  projectDescription: optionalText(200),
  defaultHours: defaultHoursField,
  addressLine1: optionalText(120),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: optionalText(12),
  country: optionalText(80),
});

export type BulkAccountRow = z.infer<typeof bulkAccountRowSchema>;

// Column order + header labels for the template and the positional parser.
export const BULK_ACCOUNT_COLUMNS = [
  { key: "orgName", header: "Client Name *" },
  { key: "outputTemplate", header: "Output Template (FSO|PRE_INVOICE, new clients)" },
  { key: "orgCurrency", header: "Client Currency (new clients, e.g. USD)" },
  { key: "accountName", header: "Account Name *" },
  { key: "accountCurrency", header: "Account Currency (blank = client default)" },
  { key: "clientPocName", header: "Client POC" },
  { key: "clientSpocEmail", header: "Client Email" },
  { key: "projectDescription", header: "Project Description" },
  { key: "defaultHours", header: "Default Hours (1-24, blank = 8)" },
  { key: "addressLine1", header: "Address Line 1" },
  { key: "city", header: "City" },
  { key: "state", header: "State" },
  { key: "postalCode", header: "Zip / Postal Code" },
  { key: "country", header: "Country" },
] as const;

export type BulkAccountColumnKey = (typeof BULK_ACCOUNT_COLUMNS)[number]["key"];
