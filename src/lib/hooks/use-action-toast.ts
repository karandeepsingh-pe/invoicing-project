"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/admin/toast-provider";
import type { ActionResult } from "@/lib/actions/result";

type SuccessOpts = {
  title?: string;
  body?: string;
};

type ErrorOpts = {
  fallbackTitle?: string;
};

/**
 * Fire toasts whenever a server action result transitions to a new value.
 * Use after a `useActionState` call:
 *
 *   const [state, action] = useActionState(deleteOrg, null);
 *   useActionToast(state, { success: { title: "Org deleted" } });
 */
export function useActionToast(
  state: ActionResult,
  opts: {
    success?: SuccessOpts | ((res: { id?: string; message?: string }) => SuccessOpts);
    error?: ErrorOpts;
  } = {},
): void {
  const toast = useToast();
  const last = useRef<ActionResult>(null);

  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (!state) return;

    if (state.ok === true) {
      const cfg =
        typeof opts.success === "function"
          ? opts.success({ id: state.id, message: state.message })
          : opts.success ?? {};
      toast.success(cfg.title ?? state.message ?? "Saved", { body: cfg.body });
      return;
    }

    if (state.ok === false) {
      const title = opts.error?.fallbackTitle ?? "Action failed";
      const body = state.formError ?? joinFieldErrors(state.fieldErrors);
      toast.error(title, { body });
    }
  }, [state, toast, opts]);
}

function joinFieldErrors(
  errs: Record<string, string[] | undefined> | undefined,
): string | undefined {
  if (!errs) return undefined;
  const lines: string[] = [];
  for (const [k, v] of Object.entries(errs)) {
    if (!v || v.length === 0) continue;
    lines.push(`${k}: ${v.join(", ")}`);
  }
  return lines.length === 0 ? undefined : lines.join(" · ");
}
