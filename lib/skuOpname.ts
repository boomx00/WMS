// Per-SKU stock opname sessions are recognised by their opname number
// prefix (SOSKU-<username>-<n>), the same way Combine CSO recognises "CSO-".
export const SKU_OPNAME_PREFIX = "SOSKU-";

export function isSkuOpname(opnameNumber: string): boolean {
  return opnameNumber.startsWith(SKU_OPNAME_PREFIX);
}