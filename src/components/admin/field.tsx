import { type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

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

export function SubmitButton({ children = "Save" }: { children?: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex items-center self-start rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
    >
      {children}
    </button>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
      {error}
    </div>
  );
}
