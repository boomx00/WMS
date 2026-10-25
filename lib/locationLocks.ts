// Locations the PDA still finds by name until every scanner has the APK
// with location pickers. The web app itself no longer depends on any of
// these. Shared by the API (lib/locationAdmin.ts) and the Locations page,
// so this file must stay free of server-only imports.

// Older APKs look these up by their code (e.g. Outbound contents reads
// OUTBOUND_WH), so they can't be renamed yet.
export const LOCKED_LOCATION_CODES = ["FLOOR", "OUTBOUND_WH"];

// Older APKs also check for the FLOOR type (Tambahan picking, stock
// opname), so the FLOOR location's type can't change yet either.
export const TYPE_LOCKED_LOCATION_CODES = ["FLOOR"];
