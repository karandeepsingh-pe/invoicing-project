// Hardcoded remittance-advice data. The remit-to / bank block is constant for
// every invoice (it is Ovation's own receiving account). The "Client Details"
// bill-to block differs PER ORG — HCL invoices show HCL America Inc. on every
// HCL account, Cognizant would show its own entity, etc. Only HCL's block is
// known today; other orgs fall back to the account's stored address.
//
// Values transcribed exactly from the reference remittance screenshot.

import { isHclOrg } from "@/lib/invoice/fso-eligibility";

export const OVATION_REMITTANCE = {
  companyName: "OVATION WORKPLACE SERVICES INC.",
  addressLines: ["55 Union Place, Suite #237", "Summit, NJ 07901"],
  remitToName: "OVATION WORKPLACE SERVICES INC",
  bankName: "Wells Fargo Bank",
  routingNumber: "121 000 248",
  accountNumber: "413 596 2736",
  accountName: "AFS Inc. / Ovation Workplace Services Inc.",
  payableNote: "AMOUNTS PAYABLE IN U.S. FUNDS",
  footerNote:
    "If you have any questions about your invoice, please contact our Receivables group at accounts@ovationwps.com. Any charges not disputed in writing within 7 days of invoice date will be considered valid.",
} as const;

/** Resolved bill-to block shown under "Client Details:" on the remittance sheet. */
export type ClientBillingDetails = {
  // Optional leading client code, e.g. "A009" → rendered as "( A009 ) <name>".
  code?: string;
  name: string;
  addressLines: string[];
};

// Per-org overrides, keyed by a normalised org identity. Add more orgs here as
// their bill-to entities are confirmed.
const HCL_CLIENT_BILLING: ClientBillingDetails = {
  code: "A009",
  name: "HCL America Inc.",
  addressLines: ["2600 Great America Way", "Santa Clara, CA 95054, United States"],
};

type AccountAddressLike = {
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

// Org-level remittance bill-to fields (editable in the org create/edit form).
// Optional on the type so callers compile before the columns are populated.
type OrgBillingLike = {
  name: string;
  remitClientCode?: string | null;
  remitClientName?: string | null;
  remitClientAddress?: string | null; // newline-separated address lines
};

/**
 * Resolve the "Client Details" block for an account's remittance sheet.
 * Precedence: the org's own configured bill-to entity → the built-in HCL
 * default (for HCL orgs that haven't filled it in yet) → the account's stored
 * address as a last resort.
 */
export function clientBillingFor(
  org: OrgBillingLike,
  account: AccountAddressLike,
): ClientBillingDetails {
  if (org.remitClientName && org.remitClientName.trim()) {
    return {
      code: org.remitClientCode?.trim() || undefined,
      name: org.remitClientName.trim(),
      addressLines: (org.remitClientAddress ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    };
  }

  if (isHclOrg(org.name)) return HCL_CLIENT_BILLING;

  const cityStateZip = [
    [account.city, account.state].filter(Boolean).join(", "),
    account.postalCode ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const addressLines = [account.addressLine1, cityStateZip, account.country].filter(
    (l): l is string => Boolean(l && l.trim()),
  );
  return { name: account.name, addressLines };
}
