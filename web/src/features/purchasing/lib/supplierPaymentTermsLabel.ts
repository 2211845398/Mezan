import type { PaymentTermRead } from '@/features/accounting/api';

import type { SupplierRead } from '../api';

/** Localized payment terms label for supplier list/detail. */
export function supplierPaymentTermsLabel(
  s: SupplierRead,
  terms: PaymentTermRead[],
  isAr: boolean,
): string {
  if (s.payment_terms_id != null) {
    const term = terms.find((t) => t.id === s.payment_terms_id);
    if (term) {
      return isAr ? term.name_ar : term.name_en;
    }
  }
  const legacy = s.payment_terms?.trim();
  if (!legacy) {
    return '—';
  }
  const byName = terms.find((t) => t.name_en === legacy || t.name_ar === legacy);
  if (byName) {
    return isAr ? byName.name_ar : byName.name_en;
  }
  return legacy;
}
