import type { TFunction } from 'i18next';

/** Localize AP statement line description from journal source metadata. */
export function formatSupplierStatementDescription(
  line: { description: string; source_type?: string | null; source_id?: string | null },
  t: TFunction<'purchasing'>,
  locale: string,
): string {
  const useAr = locale.toLowerCase().startsWith('ar');
  if (!useAr) {
    return line.description;
  }

  const sourceType = line.source_type ?? '';
  const sourceId = line.source_id ?? '';

  if (sourceType === 'goods_receipt' && sourceId) {
    return t('suppliers.statement.desc.goods_receipt', { id: sourceId });
  }
  if (sourceType === 'ap_payment_application' && sourceId) {
    return t('suppliers.statement.desc.ap_payment', { id: sourceId });
  }
  if (sourceType === 'ap_open_item' && sourceId) {
    return t('suppliers.statement.desc.ap_open_item', { id: sourceId });
  }

  const grMatch = /^Goods receipt (\d+)$/i.exec(line.description.trim());
  if (grMatch) {
    return t('suppliers.statement.desc.goods_receipt', { id: grMatch[1] });
  }
  const payMatch = /^AP supplier payment \(application (\d+)\)$/i.exec(line.description.trim());
  if (payMatch) {
    return t('suppliers.statement.desc.ap_payment', { id: payMatch[1] });
  }

  return line.description;
}
