"use client";

import { useActionState } from "react";
import { deleteMiscFee } from "@/lib/actions/misc-fee";

export function MiscFeeDeleteButton({ id }: { id: string }) {
  const [, action] = useActionState(deleteMiscFee, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-xs font-medium text-danger underline-offset-2 hover:underline"
      >
        Delete
      </button>
    </form>
  );
}
