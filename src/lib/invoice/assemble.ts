import { Prisma } from "@prisma/client";

// Pure invoice assembly: turn line-item extended totals + account add-on fees
// into { subtotal, appliedFees, grandTotal }. Percentage fees (e.g. a 3% project
// management fee) are computed on the SUBTOTAL, not the running total; flat fees
// (retainer, reimbursements) are added as-is. Grand total = subtotal + sum(fees).
// All money is rounded to 2 decimals, HALF_UP. No I/O, no LLM on this path.

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

export type FeeSpec =
  | { kind: "percent"; label: string; percent: number } // percent of subtotal, e.g. 3 = 3%
  | { kind: "flat"; label: string; amount: number };

export type AppliedFee = {
  kind: "percent" | "flat";
  label: string;
  percent?: number; // the rate applied, for percent fees
  amount: number; // computed money amount (2dp, HALF_UP)
};

export type AssembledInvoice = {
  subtotal: number;
  appliedFees: AppliedFee[];
  grandTotal: number;
};

function round2(d: DecimalLike): DecimalLike {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function assembleInvoice(
  lineItemExtendedTotals: number[],
  fees: FeeSpec[] = [],
): AssembledInvoice {
  const subtotalRaw = lineItemExtendedTotals.reduce(
    (acc, v) => acc.plus(new Decimal(v)),
    new Decimal(0),
  );
  const subtotal = round2(subtotalRaw);

  let runningTotal = subtotal;
  const appliedFees: AppliedFee[] = fees.map((fee) => {
    if (fee.kind === "percent") {
      const amount = round2(subtotal.times(new Decimal(fee.percent)).dividedBy(100));
      runningTotal = runningTotal.plus(amount);
      return {
        kind: "percent",
        label: fee.label,
        percent: fee.percent,
        amount: amount.toNumber(),
      };
    }
    const amount = round2(new Decimal(fee.amount));
    runningTotal = runningTotal.plus(amount);
    return { kind: "flat", label: fee.label, amount: amount.toNumber() };
  });

  return {
    subtotal: subtotal.toNumber(),
    appliedFees,
    grandTotal: round2(runningTotal).toNumber(),
  };
}
