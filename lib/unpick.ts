// Un-picks — marked stock moved out of a staging location to a non-staging
// one (Move on the PDA), or a Tambahan returned to where it was picked
// from — are stored as a NEGATIVE PICKING from the location the stock went
// TO into the staging location it LEFT. That keeps every order's picked and
// marked totals a plain sum of its PICKING rows, and the stock arithmetic
// (destination + quantity, source − quantity) still lands right.
//
// Anything that LISTS movements shows them as what physically happened
// instead: type "UNPICK", from the staging location to the other one, with
// a positive quantity. Safe to import from client components.

export const UNPICK_TYPE = "UNPICK";

export function isUnpick(type: string, quantity: number): boolean {
  return (type === "PICKING" || type === "DEFAULT_PICKING") && quantity < 0;
}

// The row as it physically happened: swaps source and destination fields
// (given by name) and flips the quantity for un-picks; anything else is
// returned unchanged.
export function asPhysicalMove<T extends { type: string; quantity: number }>(
  row: T,
  sourceKey: keyof T,
  destinationKey: keyof T
): T {
  if (!isUnpick(row.type, row.quantity)) return row;
  return {
    ...row,
    type: UNPICK_TYPE,
    quantity: -row.quantity,
    [sourceKey]: row[destinationKey],
    [destinationKey]: row[sourceKey],
  };
}
