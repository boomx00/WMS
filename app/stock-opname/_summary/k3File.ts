import * as XLSX from "xlsx";

// Reading a K3 "Real-time Inventory" export (.xlsx / .xls / .csv) into rows.

// One row of K3's export, as sent to the import endpoint (which keeps the
// Good Stock ones and matches Material Code to the WMS SKU).
export type K3Row = { code: unknown; name: unknown; warehouse: unknown; status: unknown; quantity: unknown };

// "Inventory Qty  (CUoM)" -> "inventoryqtycuom": headers compared without
// case, spaces or punctuation, so double spaces or brackets don't matter.
export const headerKey = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// K3 writes its .xlsx exports (with NPOI) as ZIP64 zips: the sizes in each
// file header are the 0xFFFFFFFF placeholder, with the real sizes in a ZIP64
// extra field. SheetJS 0.18 takes the placeholder literally and tries to
// allocate 4 GB ("Array buffer allocation failed"). So a ZIP64 .xlsx is
// unzipped here — real sizes from the central directory — and handed to
// SheetJS re-packed as a plain, uncompressed zip. Anything else (a normal
// .xlsx, .xls, .csv) is returned untouched.
export const ZIP_MAX32 = 0xffffffff;

export async function inflateRaw(data: Uint8Array, t: Record<string, string>): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error(t.k3_err_browser);
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function normalizeXlsx(buffer: ArrayBuffer, t: Record<string, string>): Promise<Uint8Array> {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u64 = (o: number) => Number(dv.getBigUint64(o, true));
  if (u8.length < 22 || u32(0) !== 0x04034b50) return u8; // not a zip

  // End of central directory (and the ZIP64 one, when the counts overflow).
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return u8;
  let count = u16(eocd + 10);
  let cdOffset = u32(eocd + 16);
  let zip64 = false;
  if ((count === 0xffff || cdOffset === ZIP_MAX32) && eocd >= 20 && u32(eocd - 20) === 0x07064b50) {
    const rec = u64(eocd - 12);
    if (u32(rec) === 0x06064b50) {
      count = u64(rec + 32);
      cdOffset = u64(rec + 48);
      zip64 = true;
    }
  }

  type Entry = { name: Uint8Array; method: number; csz: number; usz: number; dataStart: number };
  const entries: Entry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (u32(p) !== 0x02014b50) throw new Error(t.k3_err_damaged);
    const method = u16(p + 10);
    let csz = u32(p + 20);
    let usz = u32(p + 24);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    let localOffset = u32(p + 42);
    // ZIP64 extra field (id 0x0001): 8-byte values for whichever of the
    // above are 0xFFFFFFFF, in this order.
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen; ) {
      const id = u16(e);
      const size = u16(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (usz === ZIP_MAX32) {
          usz = u64(q);
          q += 8;
        }
        if (csz === ZIP_MAX32) {
          csz = u64(q);
          q += 8;
        }
        if (localOffset === ZIP_MAX32) localOffset = u64(q);
        zip64 = true;
      }
      e += 4 + size;
    }
    if (u32(localOffset + 18) === ZIP_MAX32 || u32(localOffset + 22) === ZIP_MAX32) zip64 = true;
    const name = u8.subarray(p + 46, p + 46 + nameLen);
    const dataStart = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28);
    if (name[name.length - 1] !== 0x2f) entries.push({ name, method, csz, usz, dataStart }); // skip folders
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!zip64) return u8; // a normal zip — SheetJS reads it fine

  // Unzip every part, then re-pack them stored (no compression).
  const parts: { name: Uint8Array; data: Uint8Array }[] = [];
  for (const e of entries) {
    const raw = u8.subarray(e.dataStart, e.dataStart + e.csz);
    if (e.method === 0) parts.push({ name: e.name, data: raw });
    else if (e.method === 8) parts.push({ name: e.name, data: await inflateRaw(raw, t) });
    else throw new Error(t.k3_err_compression.replace("{n}", String(e.method)));
  }
  const total =
    parts.reduce((n, f) => n + 30 + f.name.length + f.data.length + 46 + f.name.length, 0) + 22;
  const out = new Uint8Array(total);
  const w = new DataView(out.buffer);
  let o = 0;
  const offsets: number[] = [];
  for (const f of parts) {
    offsets.push(o);
    w.setUint32(o, 0x04034b50, true);
    w.setUint16(o + 4, 20, true); // version needed
    w.setUint32(o + 18, f.data.length, true); // compressed size
    w.setUint32(o + 22, f.data.length, true); // uncompressed size
    w.setUint16(o + 26, f.name.length, true);
    out.set(f.name, o + 30);
    out.set(f.data, o + 30 + f.name.length);
    o += 30 + f.name.length + f.data.length;
  }
  const cdStart = o;
  parts.forEach((f, i) => {
    w.setUint32(o, 0x02014b50, true);
    w.setUint16(o + 4, 20, true); // version made by
    w.setUint16(o + 6, 20, true); // version needed
    w.setUint32(o + 20, f.data.length, true);
    w.setUint32(o + 24, f.data.length, true);
    w.setUint16(o + 28, f.name.length, true);
    w.setUint32(o + 42, offsets[i], true);
    out.set(f.name, o + 46);
    o += 46 + f.name.length;
  });
  w.setUint32(o, 0x06054b50, true);
  w.setUint16(o + 8, parts.length, true);
  w.setUint16(o + 10, parts.length, true);
  w.setUint32(o + 12, o - cdStart, true);
  w.setUint32(o + 16, cdStart, true);
  return out;
}

// Reads K3's "Real-time Inventory" export: the first sheet with a Material
// Code header (in its first 20 rows), and that sheet's Material Code /
// Material Name / Warehouse Name / Inventory Status / Inventory Qty (CUoM)
// columns. Which rows count (MCI Warehouse, Good Stock) is decided by the
// import endpoint.
export async function readK3File(file: File, t: Record<string, string>): Promise<K3Row[]> {
  const book = XLSX.read(await normalizeXlsx(await file.arrayBuffer(), t), { type: "array" });
  for (const sheetName of book.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    const headerRow = grid.slice(0, 20).findIndex((r) => r.some((c) => headerKey(c) === "materialcode"));
    if (headerRow < 0) continue;
    const keys = grid[headerRow].map(headerKey);
    const code = keys.indexOf("materialcode");
    const name = keys.indexOf("materialname");
    const warehouse = keys.indexOf("warehousename");
    const status = keys.indexOf("inventorystatus");
    let qty = keys.indexOf("inventoryqtycuom");
    if (qty < 0) qty = keys.findIndex((k) => k.startsWith("inventoryqty"));
    const missing = [
      warehouse < 0 ? "Warehouse Name" : null,
      status < 0 ? "Inventory Status" : null,
      qty < 0 ? "Inventory Qty (CUoM)" : null,
    ].filter(Boolean);
    if (missing.length > 0) throw new Error(t.k3_err_missing_columns.replace("{columns}", missing.join(", ")));
    return grid
      .slice(headerRow + 1)
      .map((r) => ({
        code: r[code],
        name: name >= 0 ? r[name] : null,
        warehouse: r[warehouse],
        status: r[status],
        quantity: r[qty],
      }))
      .filter((r) => r.code !== null && r.code !== "");
  }
  throw new Error(t.k3_err_no_material_code);
}
