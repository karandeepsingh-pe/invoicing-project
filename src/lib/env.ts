import { z } from "zod";

// Treat an empty-string env var (e.g. a blank line copied from .env.example) as
// "unset" so optional vars do not fail their format checks. Without this,
// NEXTAUTH_SECRET="" trips .min(16) and 500s the whole app on first boot.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  AUTH_MICROSOFT_ENTRA_ID_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  DEV_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  // Comma-separated allowlist of admin emails. A signed-in user whose email is
  // in this list gets role ADMIN; everyone else is SDM. Parsed to a lowercased
  // string[] (blank/unset -> empty list).
  ADMIN_EMAILS: z
    .string()
    .optional()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  // Testing-phase gate for the soft-delete affordances (cell/row/month). Off in
  // prod; flip to "true" while testing. z.coerce.boolean would treat "false" as
  // true, so parse an explicit enum instead.
  SOFT_DELETE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Ovation Invoicing"),
});

const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  AUTH_MICROSOFT_ENTRA_ID_ID: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
  AUTH_MICROSOFT_ENTRA_ID_SECRET: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  AUTH_MICROSOFT_ENTRA_ID_TENANT_ID:
    process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID,
  DEV_ADMIN_EMAIL: process.env.DEV_ADMIN_EMAIL,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  SOFT_DELETE_ENABLED: process.env.SOFT_DELETE_ENABLED,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
};

const merged = serverSchema.merge(clientSchema);
const parsed = merged.safeParse(processEnv);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
