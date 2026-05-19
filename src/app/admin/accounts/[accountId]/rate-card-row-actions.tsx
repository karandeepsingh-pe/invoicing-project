"use client";

import { useActionState } from "react";
import { deleteRateCard } from "@/lib/actions/rate-card";

export function RateCardDeleteButton({ id }: { id: string }) {
  const [, action] = useActionState(deleteRateCard, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-xs text-red-600 underline hover:text-red-800"
      >
        delete
      </button>
    </form>
  );
}
