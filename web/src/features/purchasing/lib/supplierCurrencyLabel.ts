import type { TFunction } from 'i18next';

import type { SupplierRead } from '../api';

/** Human-readable supplier currency for PO forms. */
export function supplierCurrencyLabel(s: SupplierRead | undefined, t: TFunction<'purchasing'>): string {
  if (!s) return '—';
  const code = s.currency_code?.toUpperCase();
  if (code === 'LYD') return t('currency.lyd');
  if (code === 'USD') return t('currency.usd');
  if (s.currency_name) return s.currency_name;
  if (s.currency_code) return s.currency_code;
  return String(s.currency_id);
}
