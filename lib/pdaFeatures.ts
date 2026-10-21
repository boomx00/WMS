// PDA features that permissions apply to. Safe to import from client
// components (no DB access here). The web-side equivalent is lib/pages.ts.
//
// - Manager (the super role) can use every PDA feature.
// - Other roles can use a feature only if it's ticked on the PDA tab of
//   /permissions. A role with no PDA features can't log in on the PDA.
// - Menus are only for grouping on /permissions and the PDA home screen:
//   a PDA menu shows if at least one feature inside it is granted.
// - Unlike web actions, these are enforced for EVERY session (web or PDA)
//   on the API routes they guard, since those routes are PDA operations.
//   The one exception is inbound, which the web's System Control page also
//   uses — there a web session is checked against `scan.inbound` instead.
//
// Adding a key later: a new key starts OFF for every non-Manager role, so
// if it splits an existing feature, seed it for the roles that already had
// that feature or they'll lose access.

export type PdaMenu = "INBOUND" | "OUTBOUND" | "MOVE" | "STOCK_OPNAME";

export type PdaKey =
  | "pda.inbound"
  | "pda.pick"
  | "pda.pickTambahan"
  | "pda.ship"
  | "pda.shipTambahan"
  | "pda.outboundWh"
  | "pda.checkSo"
  | "pda.moveIn"
  | "pda.move"
  | "pda.stockOpname";

export type PdaFeature = {
  key: PdaKey;
  menu: PdaMenu;
  label: string;
  hint?: string;
};

export const PDA_MENUS: { key: PdaMenu; label: string }[] = [
  { key: "INBOUND", label: "Inbound" },
  { key: "OUTBOUND", label: "Outbound" },
  { key: "MOVE", label: "Move" },
  { key: "STOCK_OPNAME", label: "Stock Opname" },
];

export const PDA_FEATURES: PdaFeature[] = [
  { key: "pda.inbound", menu: "INBOUND", label: "Inbound scan" },

  { key: "pda.pick", menu: "OUTBOUND", label: "Picking (by SO)" },
  {
    key: "pda.pickTambahan",
    menu: "OUTBOUND",
    label: "Tambahan picking",
    hint: "The + Tambahan button on the picking list",
  },
  {
    key: "pda.ship",
    menu: "OUTBOUND",
    label: "Ship session",
    hint: "Includes claiming unmarked stock for the SO",
  },
  {
    key: "pda.shipTambahan",
    menu: "OUTBOUND",
    label: "Tambahan shipping",
    hint: "Tambahan lines on the ship item list",
  },
  { key: "pda.outboundWh", menu: "OUTBOUND", label: "Cek Outbound WH", hint: "View only" },
  { key: "pda.checkSo", menu: "OUTBOUND", label: "Check SO", hint: "View only" },

  { key: "pda.moveIn", menu: "MOVE", label: "Move Floor → Rack" },
  { key: "pda.move", menu: "MOVE", label: "Perpindahan lokasi", hint: "Any location to any location" },

  { key: "pda.stockOpname", menu: "STOCK_OPNAME", label: "Stock Opname counting" },
];

export const ALL_PDA_KEYS: PdaKey[] = PDA_FEATURES.map((f) => f.key);

const FEATURES_BY_KEY = new Map(PDA_FEATURES.map((f) => [f.key, f]));

export function isPdaKey(key: string): key is PdaKey {
  return FEATURES_BY_KEY.has(key as PdaKey);
}

export function getPdaFeature(key: PdaKey): PdaFeature {
  return FEATURES_BY_KEY.get(key)!;
}

export function pdaFeaturesForMenu(menu: PdaMenu): PdaFeature[] {
  return PDA_FEATURES.filter((f) => f.menu === menu);
}

export type PdaAccess = {
  roleName: string;
  isSuper: boolean;
  allowed: PdaKey[]; // every key for the super role
};

export function canDoPda(access: PdaAccess | null, key: PdaKey): boolean {
  if (!access) return false;
  if (access.isSuper) return true;
  return access.allowed.includes(key);
}
