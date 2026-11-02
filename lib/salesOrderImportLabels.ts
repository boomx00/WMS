// English text for Sales Orders → Import from Excel, used when these keys
// haven't been added to lib/pageLabels.ts yet (usePageLabels' fallbacks), so
// nothing renders blank. Keys added to pageLabels.ts (sales_page) take over
// and become editable on Settings → Translations.

export const SO_IMPORT_LABELS: Record<string, string> = {
  import_button: "Import from Excel",
  import_title: "Import Sales Orders from Excel",
  import_hint:
    "Daily schedule template: the date in row 1, then No. Doc, Material Name, Qty Ctn and Status columns. Documents with Status Done, or already in the WMS, are not imported.",
  import_choose_file: "Choose file",
  import_reading: "Reading file...",
  import_importing: "Importing...",
  import_order_date: "Order date",
  import_preview_summary: "{ok} ready to import · {failed} will fail",
  import_result_summary: "{ok} documents imported · {failed} failed",
  import_confirm: "Import {n} documents",
  import_cancel: "Cancel",
  import_another: "Import another file",
  import_close: "Close",
  import_ready: "Ready to import",
  import_imported: "Imported",
  import_failed: "Failed",
  import_th_doc: "No. Doc",
  import_th_type: "Type",
  import_th_lines: "Lines",
  import_th_qty: "Qty Ctn",
  import_th_reason: "Reason",
  import_nothing_to_import: "Nothing to import — every document in this file fails.",

  import_reason_STATUS_DONE: "Status is Done",
  import_reason_ALREADY_EXISTS: "Already in the WMS (double input)",
  import_reason_DUPLICATE_IN_FILE: "Listed twice in this file",
  import_reason_UNKNOWN_TYPE: "No Sales Order Type matches this number",
  import_reason_UNKNOWN_PRODUCT: "Unknown product: {detail}",
  import_reason_AMBIGUOUS_PRODUCT: "Product name matches several items: {detail}",
  import_reason_BAD_QTY: "Qty isn't a whole number: {detail}",
  import_reason_NO_LINES: "No product lines",
  import_reason_NO_DOC_NUMBER: "Product with no No. Doc ({detail})",
  import_reason_ERROR: "Couldn't save: {detail}",
};
