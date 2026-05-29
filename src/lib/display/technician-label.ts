export type LabelableTech = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId?: string | null;
  employerOrgName: string;
  primaryAccountName?: string | null;
};

export type TechDisplay = {
  id: string;
  baseName: string;
  suffix: string | null;
};

function nameKey(t: LabelableTech): string {
  return `${t.firstName.trim().toLowerCase()}|${t.lastName.trim().toLowerCase()}`;
}

function orgKey(t: LabelableTech): string {
  return `${nameKey(t)}|${t.employerOrgName.trim().toLowerCase()}`;
}

export function buildTechDisplayMap(
  techs: ReadonlyArray<LabelableTech>,
): Map<string, TechDisplay> {
  const nameBuckets = new Map<string, LabelableTech[]>();
  for (const t of techs) {
    const k = nameKey(t);
    const list = nameBuckets.get(k) ?? [];
    nameBuckets.set(k, [...list, t]);
  }

  const orgBuckets = new Map<string, LabelableTech[]>();
  for (const t of techs) {
    const k = orgKey(t);
    const list = orgBuckets.get(k) ?? [];
    orgBuckets.set(k, [...list, t]);
  }

  const out = new Map<string, TechDisplay>();
  for (const t of techs) {
    const base = `${t.firstName} ${t.lastName}`;
    if (t.employeeId) {
      out.set(t.id, { id: t.id, baseName: base, suffix: `#${t.employeeId}` });
      continue;
    }
    const sameName = nameBuckets.get(nameKey(t)) ?? [];
    if (sameName.length <= 1) {
      out.set(t.id, { id: t.id, baseName: base, suffix: null });
      continue;
    }
    const sameOrg = orgBuckets.get(orgKey(t)) ?? [];
    if (sameOrg.length <= 1) {
      out.set(t.id, { id: t.id, baseName: base, suffix: `(${t.employerOrgName})` });
      continue;
    }
    const account = t.primaryAccountName?.trim();
    out.set(t.id, {
      id: t.id,
      baseName: base,
      suffix: account
        ? `(${t.employerOrgName} · ${account})`
        : `(${t.employerOrgName})`,
    });
  }
  return out;
}

export function formatTechDisplay(d: TechDisplay | undefined, fallback: string): string {
  if (!d) return fallback;
  return d.suffix ? `${d.baseName} ${d.suffix}` : d.baseName;
}
