export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string[] | undefined> }
  | null;

export const idle: ActionResult = null;
