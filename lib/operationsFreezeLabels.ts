// Settings → General → Operations Freeze.
export const OPERATIONS_FREEZE_LABELS: Record<string, string> = {
  operations_freeze: "Freeze Operations",
  operations_freeze_description:
    "Blocks every stock change on the web and the PDA, for all roles: inbound, move, pick, ship, adjust, other transactions and sales order finish or delete. Viewing stock and stock opname counting still work.",
  operations_freeze_on: "Operations are frozen. Nothing can change stock until this is turned off.",
  operations_freeze_confirm: "Freeze operations? Nobody will be able to move, receive, ship or adjust stock until this is turned off.",
  operations_freeze_failed: "Failed to save",
};
