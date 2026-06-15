// FSO availability is HCL-only. Rather than depend on the org's mutable
// `outputTemplate` flag (which has been flipped to PRE_INVOICE on the HCL org),
// gate the FSO export on the org BEING HCL — matched by name. This way every
// account under the HCL org (existing and any newly created) gets the FSO
// option automatically, with no DB edit. An explicit FSO template flag, if one
// is ever set on an org, is still honoured.

export type FsoOrgLike = {
  name: string;
  outputTemplate: string;
};

/** True when the org should offer the HCL FSO workbook. */
export function orgSupportsFso(org: FsoOrgLike): boolean {
  return org.outputTemplate === "FSO" || isHclOrg(org.name);
}

/** Normalised HCL match: "HCL", "hcl", "HCL America", " HCL " → true. */
export function isHclOrg(orgName: string): boolean {
  return /^hcl\b/i.test(orgName.trim());
}
