"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/signin" })}
      className="rounded-md border border-border-strong bg-surface/60 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
    >
      Sign out
    </button>
  );
}
