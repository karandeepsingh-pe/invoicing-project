"use client";

/**
 * Compact inline filter input for dialogs and table headers — the non-sticky
 * cousin of SearchBar (which is a sticky page-level toolbar).
 */
export function FilterInput({
  value,
  onChange,
  placeholder = "Filter…",
  className,
  inputClassName,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={`relative flex items-center ${className ?? ""}`}>
      <SearchIcon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-subtle" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Filter"
        className={`glass-input w-full rounded-md py-1.5 pl-8 pr-8 text-sm text-fg placeholder:text-fg-subtle transition-colors ${inputClassName ?? ""}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear filter"
          className="absolute right-1.5 rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
