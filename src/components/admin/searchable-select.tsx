"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { filterByText } from "@/lib/display/option-filter";

export type SearchableOption = {
  value: string;
  label: string;
  /** Muted suffix shown on the row (e.g. "busy 09:00–11:00"); also searched. */
  sublabel?: string;
  disabled?: boolean;
};

type PanelPosition = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
};

const PANEL_MAX_HEIGHT = 280;

function optionText(o: SearchableOption): string {
  return o.sublabel ? `${o.label} ${o.sublabel}` : o.label;
}

/**
 * Searchable drop-in replacement for SelectField. Submits via a hidden input
 * (`name`), so FormData-based server actions keep working unchanged. Hidden
 * inputs skip native `required` validation — server-side Zod remains the
 * enforcement point.
 *
 * Controlled when `value` is provided; otherwise uncontrolled, preselecting
 * `defaultValue` or the first non-disabled option (native-select parity).
 */
export function SearchableSelectField({
  label,
  name,
  options,
  value,
  onChange,
  defaultValue,
  placeholder = "—",
  errors,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  options: readonly SearchableOption[];
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  errors?: string[];
  hint?: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(
    () => defaultValue ?? options.find((o) => !o.disabled)?.value ?? "",
  );
  // Options arriving after mount (uncontrolled only): adopt the first
  // non-disabled option so the hidden input never posts an empty value.
  useEffect(() => {
    if (isControlled || internalValue !== "") return;
    const first = options.find((o) => !o.disabled);
    if (first) setInternalValue(first.value);
  }, [isControlled, internalValue, options]);

  const selectedValue = isControlled ? value : internalValue;
  const selected = options.find((o) => o.value === selectedValue);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const filtered = useMemo(
    () => filterByText(options, query, optionText),
    [options, query],
  );

  // Re-anchor highlight whenever the visible list changes: prefer the selected
  // option, else the first selectable row; clamp when the list shrinks.
  useEffect(() => {
    if (!open) return;
    const selectedIdx = filtered.findIndex(
      (o) => o.value === selectedValue && !o.disabled,
    );
    if (selectedIdx >= 0) {
      setHighlight(selectedIdx);
      return;
    }
    const firstEnabled = filtered.findIndex((o) => !o.disabled);
    setHighlight(firstEnabled >= 0 ? firstEnabled : 0);
  }, [open, filtered, selectedValue]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (refocus) triggerRef.current?.focus();
  }, []);

  function openPanel() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
    setPosition({
      left: rect.left,
      width: rect.width,
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
    setQuery("");
    setOpen(true);
  }

  function select(option: SearchableOption) {
    if (option.disabled) return;
    if (!isControlled) setInternalValue(option.value);
    onChange?.(option.value);
    close(true);
  }

  // Focus the search box once the panel is in the DOM.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Outside dismiss + close on scroll/resize (a fixed panel would detach from
  // its trigger). Scrolls inside the panel's own list are ignored.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close(false);
    }
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      close(false);
    }
    function onResize() {
      close(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, { capture: true });
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  function moveHighlight(delta: 1 | -1) {
    if (filtered.length === 0) return;
    setHighlight((prev) => {
      let next = prev;
      for (let step = 0; step < filtered.length; step += 1) {
        next = (next + delta + filtered.length) % filtered.length;
        if (!filtered[next]?.disabled) return next;
      }
      return prev;
    });
  }

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Enter") {
      // Never let Enter submit the enclosing <form action>.
      e.preventDefault();
      const option = filtered[highlight];
      if (option && !option.disabled) select(option);
    } else if (e.key === "Escape") {
      // Keep a parent Dialog open: its close handler listens on document, the
      // same node React 19 delegates to, so stop the native event entirely.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  const panelStyle: CSSProperties | undefined = position
    ? {
        position: "fixed",
        left: position.left,
        width: position.width,
        top: position.top,
        bottom: position.bottom,
      }
    : undefined;

  const panel =
    open && position ? (
      <div
        ref={panelRef}
        style={panelStyle}
        className="glass-strong z-[110] flex flex-col gap-1 rounded-md border border-border p-1 shadow-2xl"
      >
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Type to search…"
          aria-label={`Search ${label}`}
          className="glass-input w-full rounded-md px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-subtle"
        />
        <ul role="listbox" aria-labelledby={labelId} className="max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-fg-subtle">No options</li>
          ) : filtered.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-fg-subtle">No matches</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === selectedValue}
                aria-disabled={o.disabled || undefined}
                // Keep focus in the search box while clicking rows.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => select(o)}
                onMouseEnter={() => {
                  if (!o.disabled) setHighlight(i);
                }}
                className={`flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm ${
                  o.disabled
                    ? "cursor-not-allowed text-fg-subtle opacity-50"
                    : i === highlight
                      ? "bg-surface-2 text-fg"
                      : "text-fg"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.sublabel && (
                  <span className="ml-auto flex-shrink-0 text-xs text-fg-subtle">
                    {o.sublabel}
                  </span>
                )}
                {o.value === selectedValue && (
                  <CheckIcon
                    className={`h-3.5 w-3.5 flex-shrink-0 text-accent ${o.sublabel ? "" : "ml-auto"}`}
                  />
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-xs font-medium text-fg-muted">
        {label}
      </span>
      <input type="hidden" name={name} value={selectedValue} />
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => (open ? close(false) : openPanel())}
        className="glass-input flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "" : "text-fg-subtle"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronIcon className="h-3.5 w-3.5 flex-shrink-0 text-fg-subtle" />
      </button>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="text-xs text-danger">
          {e}
        </span>
      ))}
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}
