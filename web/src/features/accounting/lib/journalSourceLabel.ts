import type { TFunction } from 'i18next';

/** Known journal entry source_type values posted by the backend. */
export const JOURNAL_SOURCE_TYPES = [
  'manual',
  'journal_reversal',
  'sales_invoice',
  'sales_return',
  'goods_receipt',
  'pos_shift',
  'pos_sale',
  'payslip',
  'payroll',
  'stock_adjustment',
  'inventory_adjustment',
  'transfer',
  'transfer_batch',
  'opening_balance',
  'fx_revaluation',
  'ar_payment',
  'ar_payment_application',
  'ap_payment',
  'ap_payment_application',
  'purchase_receipt',
  'loyalty_ledger',
  'production_order',
] as const;

export type JournalSourceType = (typeof JOURNAL_SOURCE_TYPES)[number];

export function journalSourceLabel(t: TFunction<'accounting'>, sourceType: string): string {
  const key = `journal.source.${sourceType}`;
  const translated = t(key);
  if (translated && translated !== key) {
    return translated;
  }
  if (sourceType.startsWith('voucher_')) {
    return t('journal.source.voucher', { type: sourceType.replace(/^voucher_/, '') });
  }
  return sourceType;
}
