import { omitUndefined } from '@/lib/omitUndefined';

export type LedgerDrillDownParams = {
  account_id: number;
  date_from?: string | undefined;
  date_to?: string | undefined;
  branch_id?: number | undefined;
  customer_id?: number | undefined;
  supplier_id?: number | undefined;
  employee_id?: number | undefined;
};

export function buildLedgerDrillDownUrl(params: LedgerDrillDownParams): string {
  const p = omitUndefined(params) as LedgerDrillDownParams;
  const q = new URLSearchParams();
  q.set('account_id', String(p.account_id));
  if (p.date_from) q.set('date_from', p.date_from);
  if (p.date_to) q.set('date_to', p.date_to);
  if (p.branch_id != null) q.set('branch_id', String(p.branch_id));
  if (p.customer_id != null) q.set('customer_id', String(p.customer_id));
  if (p.supplier_id != null) q.set('supplier_id', String(p.supplier_id));
  if (p.employee_id != null) q.set('employee_id', String(p.employee_id));
  return `/accounting/general-ledger?${q.toString()}`;
}
