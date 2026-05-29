"use client";

export type FlagDefaults = {
  isAvailableForDedicated?: boolean;
  isAvailableForProject?: boolean;
  isAvailableForDispatch?: boolean;
};

const ITEMS: { name: keyof FlagDefaults; label: string }[] = [
  { name: "isAvailableForDedicated", label: "Dedicated FTE" },
  { name: "isAvailableForProject", label: "Project / T&M" },
  { name: "isAvailableForDispatch", label: "Dispatch" },
];

/**
 * Three opt-in pool checkboxes. A technician only surfaces in a category's
 * new-assignment picker when its flag is on. Flags are never auto-cleared by
 * dedication — a tech with an active dedication is simply hidden from the
 * Project/Dispatch pickers for the duration (computed elsewhere).
 */
export function AvailabilityFlagsField({ defaults }: { defaults?: FlagDefaults }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">Available for (pools)</span>
      <div className="flex flex-wrap gap-2">
        {ITEMS.map((it) => (
          <label
            key={it.name}
            className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              name={it.name}
              defaultChecked={Boolean(defaults?.[it.name])}
              className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
            />
            <span className="text-fg-muted">{it.label}</span>
          </label>
        ))}
      </div>
      <span className="text-xs text-fg-subtle">
        A technician appears in a pool&apos;s new-assignment picker only when flagged here.
        An active dedication hides them from Project/Dispatch regardless.
      </span>
    </div>
  );
}
