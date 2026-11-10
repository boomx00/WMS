import { numeric } from "drizzle-orm/pg-core";

// A stock quantity column: up to 3 decimal places, so a product counted in
// Kilogram can hold 12.5. How many decimals a product may actually use is
// its unit's "Decimals" (Items page → Units); Carton / Pack stay whole.
// Read and written as plain JS numbers.
export const QTY_SCALE = 3;

export const qty = (name: string) => numeric(name, { precision: 14, scale: QTY_SCALE, mode: "number" });
