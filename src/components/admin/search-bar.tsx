"use client";

import { useEffect, useState } from "react";

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  countLabel,
  rightSlot,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  countLabel?: string;
  rightSlot?: React.ReactNode;
}) {
  // Local mirror prevents layout shift while debouncing parent updates if needed.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 px-1 pb-2 pt-1 md:flex-row md:items-center md:justify-between">
      <div className="relative flex w-full max-w-md items-center">
        <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-fg-subtle" />
        <input
          type="text"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          className="glass-input w-full rounded-md py-2 pl-9 pr-9 text-sm text-fg placeholder:text-fg-subtle transition-colors"
          aria-label="Search"
        />
        {local && (
          <button
            type="button"
            onClick={() => {
              setLocal("");
              onChange("");
            }}
            aria-label="Clear search"
            className="absolute right-2 rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-fg-subtle">
        {countLabel && <span className="tabular-nums">{countLabel}</span>}
        {rightSlot}
      </div>
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
