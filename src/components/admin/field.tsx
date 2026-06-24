"use client";

import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";

type FieldProps = {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

const inputClass =
  "glass-input rounded-md px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors";

export function TextField({
  label,
  name,
  errors,
  hint,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <input name={name} className={inputClass} {...rest} />
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="text-xs text-danger">
          {e}
        </span>
      ))}
    </label>
  );
}

export function TextAreaField({
  label,
  name,
  errors,
  hint,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <textarea name={name} className={inputClass} {...rest} />
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="text-xs text-danger">
          {e}
        </span>
      ))}
    </label>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <select name={name} className={inputClass} {...rest}>
        {children}
      </select>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="text-xs text-danger">
          {e}
        </span>
      ))}
    </label>
  );
}

// Submit button wired to the enclosing <form>'s pending state via useFormStatus.
// While the server action runs it disables itself and shows a spinner + "Saving..."
// so a slow mutation never looks frozen. Must render inside a <form>.
export function SubmitButton({ children = "Save" }: { children?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center gap-2 self-start rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg"
        />
      )}
      {pending ? "Saving…" : children}
    </button>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="whitespace-pre-line rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
      {error}
    </div>
  );
}
