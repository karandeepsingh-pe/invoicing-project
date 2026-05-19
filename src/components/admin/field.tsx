import { type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

export function TextField({
  label,
  name,
  errors,
  hint,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        {...rest}
      />
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="text-xs text-red-600">
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
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
        className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        {...rest}
      >
        {children}
      </select>
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="text-xs text-red-600">
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
      className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
    >
      {children}
    </button>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
      {error}
    </div>
  );
}
