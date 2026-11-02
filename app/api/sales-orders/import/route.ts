import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getSalesOrderTypes, type SalesOrderType } from "@/lib/salesOrderTypes";
import { formatSoDisplay } from "@/lib/soDisplay";
import {
  docKey,
  parseSalesOrderSheet,
  productNameKey,
  type ImportDocResult,
  type ImportFailReason,
  type ImportResponse,
} from "@/lib/salesOrderImport";

// POST /api/sales-orders/import — Sales Orders → Import from Excel.
// multipart form: file (.xlsx / .xls), commit ("1" = save, else preview).
//
// Every document in the file is checked on its own; one bad document never
// stops the others. A document fails (and is not saved) when:
//   - its Status is Done (already finished — not wanted in the WMS)
//   - its number already exists in the WMS, or appears twice in the file
//   - its number doesn't start with any Sales Order Type (SO-, HPT, MDE…)
//   - a product can't be matched to an item, or a qty isn't a whole number
// The date in row 1 becomes every imported document's order date.
//
// Preview (commit not "1") runs every check and saves nothing; the page
// shows it so the date and results can be checked before importing. The
// import itself re-runs all checks, then saves each document in its own
// transaction.

type ItemRow = { id: number; sku: string; legacySku: string | null; name: string };

// Longest matching type wins, so "SO-" doesn't steal a number that a more
// specific prefix like "SO/MDE-" fits. A type matches by its SO Number
// Prefix or its name, as a whole word ("SO" must not match "SOX…").
function matchType(docNumber: string, types: SalesOrderType[]): SalesOrderType | null {
  const clean = docNumber.toLowerCase();
  let best: SalesOrderType | null = null;
  let bestLength = 0;
  for (const type of types) {
    for (const start of [type.numberPrefix?.trim(), type.name.trim()]) {
      if (!start) continue;
      const s = start.toLowerCase();
      if (!clean.startsWith(s)) continue;
      if (/[a-z]$/.test(s) && /^[a-z]/.test(clean.slice(s.length))) continue;
      if (s.length > bestLength) {
        best = type;
        bestLength = s.length;
      }
    }
  }
  return best;
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const denied = await denyUnlessAllowed(session, "so.create");
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file");
  const commit = formData.get("commit") === "1";
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // ── Read the sheet ──
  let rows: unknown[][];
  let firstRowNumber = 1;
  try {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "The file has no sheets" }, { status: 400 });
    }
    const sheet = workbook.Sheets[sheetName];
    if (sheet["!ref"]) firstRowNumber = XLSX.utils.decode_range(sheet["!ref"]).s.r + 1;
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  } catch {
    return NextResponse.json({ error: "Couldn't read this file — is it a valid .xlsx/.xls?" }, { status: 400 });
  }

  const parsed = parseSalesOrderSheet(rows, firstRowNumber);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (!parsed.orderDate) {
    return NextResponse.json(
      { error: 'Couldn\'t read the date in row 1 — expected something like "Senin, 02 November 2026".' },
      { status: 400 }
    );
  }
  if (parsed.docs.length === 0 && parsed.orphanRows.length === 0) {
    return NextResponse.json({ error: "No documents found in the file" }, { status: 400 });
  }

  // ── Look-ups, loaded once ──
  const allKeys = Array.from(new Set(parsed.docs.map((d) => docKey(d.docNumber)).filter(Boolean)));
  const [types, allItems, existingRows] = await Promise.all([
    getSalesOrderTypes(db),
    db
      .select({ id: items.id, sku: items.sku, legacySku: items.legacySku, name: items.name })
      .from(items) as Promise<ItemRow[]>,
    allKeys.length === 0
      ? Promise.resolve([] as { key: string }[])
      : db
          .select({ key: sql<string>`lower(regexp_replace(${salesOrders.soNumber}, '[^A-Za-z0-9]', '', 'g'))` })
          .from(salesOrders)
          .where(
            inArray(sql`lower(regexp_replace(${salesOrders.soNumber}, '[^A-Za-z0-9]', '', 'g'))`, allKeys)
          ),
  ]);

  const existing = new Set(existingRows.map((r) => r.key));

  const bySku = new Map<string, ItemRow>();
  const byName = new Map<string, ItemRow[]>();
  for (const item of allItems) {
    bySku.set(item.sku.trim().toLowerCase(), item);
    if (item.legacySku) {
      const legacy = item.legacySku.trim().toLowerCase();
      if (!bySku.has(legacy)) bySku.set(legacy, item);
    }
    const key = productNameKey(item.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(item);
  }

  // ── Check every document ──
  type Planned = ImportDocResult & { itemLines: { itemId: number; quantity: number }[] };
  const planned: Planned[] = [];
  const seenInFile = new Set<string>();

  for (const doc of parsed.docs) {
    const key = docKey(doc.docNumber);
    const type = matchType(doc.docNumber, types);
    const soNumber = type ? formatSoDisplay(doc.docNumber, type) : doc.docNumber;
    const result: Planned = {
      row: doc.row,
      docNumber: doc.docNumber,
      soNumber,
      typeName: type?.name ?? null,
      lines: [],
      totalQty: 0,
      ok: false,
      reason: null,
      detail: null,
      itemLines: [],
    };
    const fail = (reason: ImportFailReason, detail: string | null = null) => {
      result.reason = reason;
      result.detail = detail;
      planned.push(result);
    };

    // Resolve lines first so even failed documents show what they held.
    const merged = new Map<number, { item: ItemRow; quantity: number }>();
    let lineProblem: { reason: ImportFailReason; detail: string } | null = null;
    for (const line of doc.lines) {
      let item: ItemRow | undefined = line.sku ? bySku.get(line.sku.toLowerCase()) : undefined;
      if (!item && line.name) {
        const matches = byName.get(productNameKey(line.name)) ?? [];
        if (matches.length > 1 && !lineProblem) {
          lineProblem = {
            reason: "AMBIGUOUS_PRODUCT",
            detail: `${line.name} (row ${line.row}: ${matches.map((m) => m.sku).join(", ")})`,
          };
          continue;
        }
        item = matches[0];
      }
      if (!item) {
        lineProblem ??= { reason: "UNKNOWN_PRODUCT", detail: `${line.sku || line.name} (row ${line.row})` };
        continue;
      }
      if (line.quantity === null) {
        lineProblem ??= { reason: "BAD_QTY", detail: `"${line.rawQuantity || "empty"}" (row ${line.row})` };
        continue;
      }
      const prev = merged.get(item.id);
      merged.set(item.id, { item, quantity: (prev?.quantity ?? 0) + line.quantity });
    }
    result.lines = Array.from(merged.values()).map((m) => ({
      sku: m.item.sku,
      name: m.item.name,
      quantity: m.quantity,
    }));
    result.itemLines = Array.from(merged.values()).map((m) => ({ itemId: m.item.id, quantity: m.quantity }));
    result.totalQty = result.lines.reduce((sum, l) => sum + l.quantity, 0);

    // Checked in this order, so the most useful reason is the one shown.
    if (doc.done) { fail("STATUS_DONE"); continue; }
    if (seenInFile.has(key)) { fail("DUPLICATE_IN_FILE"); continue; }
    seenInFile.add(key);
    if (existing.has(key) || existing.has(docKey(soNumber))) { fail("ALREADY_EXISTS"); continue; }
    if (!type) { fail("UNKNOWN_TYPE"); continue; }
    if (doc.lines.length === 0) { fail("NO_LINES"); continue; }
    if (lineProblem) { fail(lineProblem.reason, lineProblem.detail); continue; }

    result.ok = true;
    planned.push(result);
  }

  for (const row of parsed.orphanRows) {
    planned.push({
      row,
      docNumber: "",
      soNumber: "",
      typeName: null,
      lines: [],
      totalQty: 0,
      ok: false,
      reason: "NO_DOC_NUMBER",
      detail: `row ${row}`,
      itemLines: [],
    });
  }
  planned.sort((a, b) => a.row - b.row);

  // ── Save ──
  if (commit) {
    const orderDate = new Date(parsed.orderDate); // "YYYY-MM-DD", same as the create form
    for (const p of planned) {
      if (!p.ok) continue;
      try {
        await db.transaction(async (tx) => {
          const typeId = types.find((t) => t.name === p.typeName)?.id ?? null;
          const [order] = await tx
            .insert(salesOrders)
            .values({ soNumber: p.soNumber, salesOrderTypeId: typeId, orderDate })
            .returning({ id: salesOrders.id });
          await tx.insert(salesOrderItems).values(
            p.itemLines.map((l) => ({ salesOrderId: order.id, itemId: l.itemId, quantity: l.quantity }))
          );
        });
      } catch (e) {
        p.ok = false;
        if (isUniqueViolation(e)) {
          // Created by someone else between the check and now.
          p.reason = "ALREADY_EXISTS";
        } else {
          console.error(`[sales-orders/import] ${p.soNumber}:`, e);
          p.reason = "ERROR";
          p.detail = e instanceof Error ? e.message : String(e);
        }
      }
    }
  }

  const response: ImportResponse = {
    committed: commit,
    orderDate: parsed.orderDate,
    dateText: parsed.dateText,
    results: planned.map(({ itemLines: _unused, ...r }) => r),
  };
  return NextResponse.json(response);
}
