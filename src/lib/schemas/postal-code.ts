import { z } from "zod";

const zipcodeField = z
  .string()
  .trim()
  .min(1, "Zipcode is required")
  .max(12, "Zipcode is too long");

const placeField = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(80, `${label} is too long`);

const sortOrderField = z.coerce.number().int().min(0).optional().default(0);

export const postalCodeCreateSchema = z.object({
  zipcode: zipcodeField,
  city: placeField("City"),
  state: placeField("State"),
  country: placeField("Country"),
  sortOrder: sortOrderField,
});

export type PostalCodeCreateInput = z.infer<typeof postalCodeCreateSchema>;

export const postalCodeUpdateSchema = z.object({
  id: z.string().min(1),
  zipcode: zipcodeField,
  city: placeField("City"),
  state: placeField("State"),
  country: placeField("Country"),
  sortOrder: sortOrderField,
});

export type PostalCodeUpdateInput = z.infer<typeof postalCodeUpdateSchema>;
