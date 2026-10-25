import * as XLSX from "xlsx";

export function downloadXlsx(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  sheetName = "Sheet1"
) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename, { bookType: "xlsx" });
}

export function downloadXlsxMultiSheet(
  filename: string,
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]
) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31)); // Excel's sheet-name limit
  }
  XLSX.writeFile(workbook, filename, { bookType: "xlsx" });
}