import { z } from "zod";
import { AssignmentSlaTier, RateCategory } from "@prisma/client";

const employeeIdField = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();

const zipcodeOptional = optionalText(12);
const placeOptional = optionalText(80);
const phoneOptional = optionalText(40);
const addressOptional = optionalText(120);
const emailOptional = z
  .string()
  .trim()
  .email()
  .max(120)
  .optional()
  .or(z.literal("").transform(() => undefined));

const availabilityFlags = {
  isAvailableForDedicated: z.coerce.boolean().optional().default(false),
  isAvailableForProject: z.coerce.boolean().optional().default(false),
  isAvailableForDispatch: z.coerce.boolean().optional().default(false),
};

// Money fields are passed as `value || undefined` by the action, so empty → undefined.
const optionalDecimal = z.coerce.number().nonnegative().max(99_999_999).optional();
const rebadgedFields = {
  isRebadged: z.coerce.boolean().optional().default(false),
  annualSalary: optionalDecimal,
  rebadgedOtRate: optionalDecimal,
  rebadgedWeekendRate: optionalDecimal,
};

export const technicianCreateSchema = z.object({
  employerOrgId: z.string().min(1),
  employeeId: employeeIdField,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  primaryCategory: z.nativeEnum(RateCategory),
  band: z.coerce.number().int().min(0).max(4),
  defaultSlaTier: z.nativeEnum(AssignmentSlaTier).optional(),
  phone: phoneOptional,
  email: emailOptional,
  ...availabilityFlags,
  ...rebadgedFields,
  zipcode: zipcodeOptional,
  locationCity: placeOptional,
  locationState: placeOptional,
  locationCountry: placeOptional,
  addressLine1: addressOptional,
  initialAccountId: z.string().optional(),
  initialCategory: z.nativeEnum(RateCategory).optional(),
  initialStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
});

export type TechnicianCreateInput = z.infer<typeof technicianCreateSchema>;

export const technicianUpdateSchema = z.object({
  id: z.string().min(1),
  employerOrgId: z.string().min(1),
  employeeId: employeeIdField,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  primaryCategory: z.nativeEnum(RateCategory),
  band: z.coerce.number().int().min(0).max(4),
  defaultSlaTier: z.nativeEnum(AssignmentSlaTier).optional(),
  active: z.coerce.boolean().optional().default(true),
  phone: phoneOptional,
  email: emailOptional,
  ...availabilityFlags,
  ...rebadgedFields,
  zipcode: zipcodeOptional,
  locationCity: placeOptional,
  locationState: placeOptional,
  locationCountry: placeOptional,
  addressLine1: addressOptional,
});

export type TechnicianUpdateInput = z.infer<typeof technicianUpdateSchema>;
