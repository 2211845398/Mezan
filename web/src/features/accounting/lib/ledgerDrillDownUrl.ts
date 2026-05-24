export type LedgerDrillDownParams = {
  account_id: number;
  date_from?: string;
  date_to?: string;
  branch_id?: number;
  customer_id?: number;
  supplier_id?: number;
  employee_id?: number;
};

export function buildLedgerDrillDownUrl(params: LedgerDrillDownParams): string {
  const q = new URLSearchParams();
  q.set('account_id', String(params.account_id));
  if (params.date_from) q.set('date_from', params.date_from);
  if (params.date_to) q.set('date_to', params.date_to);
  if (params.branch_id != null) q.set('branch_id', String(params.branch_id));
  if (params.customer_id != null) q.set('customer_id', String(params.customer_id));
  if (params.supplier_id != null) q.set('supplier_id', String(params.supplier_id));
  if (params.employee_id != null) q.set('employee_id', String(params.employee_id));
  return `/accounting/general-ledger?${q.toString()}`;
}
