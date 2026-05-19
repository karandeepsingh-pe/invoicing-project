"use client";

import { useActionState } from "react";
import { deleteMiscFee } from "@/lib/actions/misc-fee";

export function MiscFeeDeleteButton({ id }: { id: string }) {
  const [, action] = useActionState(deleteMiscFee, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">
        delete
      </button>
    </form>
  );
}
