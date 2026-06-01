import type { TFunction } from 'i18next';

export type JournalEntryDescriptionInput = {
  description: string;
  source_type: string;
  source_id?: string | null;
};

/**
 * Localize system-generated journal entry descriptions for Arabic UI.
 * User-authored text (manual entries, reversal reasons in parentheses) is kept as stored.
 */
export function formatJournalEntryDescription(
  entry: JournalEntryDescriptionInput,
  t: TFunction<'accounting'>,
  locale: string,
): string {
  const raw = entry.description?.trim() ?? '';
  if (!raw || !locale.toLowerCase().startsWith('ar')) {
    return raw;
  }

  if (entry.source_type === 'manual') {
    return raw;
  }

  const sourceId = entry.source_id?.trim() ?? '';

  const bySource = localizeBySourceType(entry.source_type, sourceId, raw, t);
  if (bySource) {
    return bySource;
  }

  const byPattern = localizeByEnglishPattern(raw, t);
  if (byPattern) {
    return byPattern;
  }

  return raw;
}

function localizeBySourceType(
  sourceType: string,
  sourceId: string,
  raw: string,
  t: TFunction<'accounting'>,
): string | null {
  switch (sourceType) {
    case 'goods_receipt':
    case 'purchase_receipt':
      return sourceId ? t('journal.desc.goods_receipt', { id: sourceId }) : null;
    case 'transfer_batch':
    case 'transfer': {
      const m = /^Transfer batch (\d+) received$/i.exec(raw);
      const id = m?.[1] ?? sourceId;
      return id ? t('journal.desc.transfer_batch_received', { id }) : null;
    }
    case 'journal_reversal': {
      const m = /^Reversal of JE #(\d+)(?: \((.+)\))?$/i.exec(raw);
      const id = m?.[1] ?? sourceId;
      if (!id) return null;
      const base = t('journal.desc.reversal', { id });
      return m?.[2] ? `${base} (${m[2]})` : base;
    }
    case 'sales_invoice': {
      const settlement = /^Sales invoice (.+) \(settlement\)$/i.exec(raw);
      if (settlement) {
        return t('journal.desc.sales_invoice_settlement', { ref: settlement[1] });
      }
      const accrual = /^Sales invoice (.+) accrual$/i.exec(raw);
      if (accrual) {
        return t('journal.desc.sales_invoice_accrual', { ref: accrual[1] });
      }
      const plain = /^Sales invoice (.+)$/i.exec(raw);
      if (plain) {
        return t('journal.desc.sales_invoice_settlement', { ref: plain[1] });
      }
      const cogs = /^COGS (.+)$/i.exec(raw);
      if (cogs) {
        return t('journal.desc.cogs', { ref: cogs[1] });
      }
      return null;
    }
    case 'sales_return':
      return sourceId ? t('journal.desc.sales_return', { id: sourceId }) : null;
    case 'ar_payment_application':
      return sourceId ? t('journal.desc.ar_payment_application', { id: sourceId }) : null;
    case 'ap_payment_application':
      return sourceId ? t('journal.desc.ap_payment_application', { id: sourceId }) : null;
    case 'payslip':
    case 'payroll':
      return sourceId ? t('journal.desc.payslip_approved', { id: sourceId }) : null;
    case 'pos_shift':
      return sourceId ? t('journal.desc.pos_shift_variance', { id: sourceId }) : null;
    case 'loyalty_ledger':
      return sourceId ? t('journal.desc.loyalty_ledger', { id: sourceId }) : null;
    case 'fx_revaluation':
      return localizeFxRevaluation(raw, t);
    case 'stock_adjustment':
    case 'inventory_adjustment':
      return localizeInventoryAdjustment(raw, t);
    case 'production_order':
      return localizeProductionOrder(raw, t);
    default:
      return null;
  }
}

function localizeFxRevaluation(raw: string, t: TFunction<'accounting'>): string | null {
  const ar = /^FX Revaluation (\S+) AR - (\S+) (.+)$/i.exec(raw);
  if (ar) {
    return t('journal.desc.fx_revaluation_ar', {
      currency: ar[1],
      sourceType: ar[2],
      sourceId: ar[3],
    });
  }
  const ap = /^FX Revaluation (\S+) AP - (\S+) (.+)$/i.exec(raw);
  if (ap) {
    return t('journal.desc.fx_revaluation_ap', {
      currency: ap[1],
      sourceType: ap[2],
      sourceId: ap[3],
    });
  }
  return null;
}

function localizeInventoryAdjustment(raw: string, t: TFunction<'accounting'>): string | null {
  const m = /^Inventory adjustment - (.+?) \(mv (\d+)\)$/i.exec(raw);
  if (m) {
    return t('journal.desc.inventory_adjustment', { reason: m[1], movementId: m[2] });
  }
  const excess = /^Inventory adjustment - excess found \(mv (\d+)\)$/i.exec(raw);
  if (excess) {
    return t('journal.desc.inventory_adjustment_excess', { movementId: excess[1] });
  }
  return null;
}

function localizeProductionOrder(raw: string, t: TFunction<'accounting'>): string | null {
  const issue = /^Production order (.+) — material issue$/i.exec(raw);
  if (issue) {
    return t('journal.desc.production_material', { order: issue[1] });
  }
  const finished = /^Production order (.+) — finished goods$/i.exec(raw);
  if (finished) {
    return t('journal.desc.production_finished', { order: finished[1] });
  }
  return null;
}

function localizeByEnglishPattern(raw: string, t: TFunction<'accounting'>): string | null {
  const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^Goods receipt (\d+)$/i, (m) => t('journal.desc.goods_receipt', { id: m[1] })],
    [
      /^Transfer batch (\d+) received$/i,
      (m) => t('journal.desc.transfer_batch_received', { id: m[1] }),
    ],
    [
      /^Reversal of JE #(\d+)(?: \((.+)\))?$/i,
      (m) => {
        const base = t('journal.desc.reversal', { id: m[1] });
        return m[2] ? `${base} (${m[2]})` : base;
      },
    ],
    [
      /^Sales invoice (.+) \(settlement\)$/i,
      (m) => t('journal.desc.sales_invoice_settlement', { ref: m[1] }),
    ],
    [/^Sales invoice (.+) accrual$/i, (m) => t('journal.desc.sales_invoice_accrual', { ref: m[1] })],
    [/^Sales invoice (.+)$/i, (m) => t('journal.desc.sales_invoice_settlement', { ref: m[1] })],
    [/^COGS (.+)$/i, (m) => t('journal.desc.cogs', { ref: m[1] })],
    [/^COGS restore (.+)$/i, (m) => t('journal.desc.cogs_restore', { ref: m[1] })],
    [/^Sales return (.+)$/i, (m) => t('journal.desc.sales_return', { id: m[1] })],
    [
      /^AR cash receipt \(application (\d+)\)$/i,
      (m) => t('journal.desc.ar_payment_application', { id: m[1] }),
    ],
    [
      /^AP supplier payment \(application (\d+)\)$/i,
      (m) => t('journal.desc.ap_payment_application', { id: m[1] }),
    ],
    [/^Payslip (\d+) approved$/i, (m) => t('journal.desc.payslip_approved', { id: m[1] })],
    [/^POS shift (\d+) cash variance$/i, (m) => t('journal.desc.pos_shift_variance', { id: m[1] })],
    [/^Loyalty ledger (\d+)$/i, (m) => t('journal.desc.loyalty_ledger', { id: m[1] })],
  ];

  for (const [re, fn] of rules) {
    const m = re.exec(raw);
    if (m) return fn(m);
  }

  return localizeFxRevaluation(raw, t) ?? localizeInventoryAdjustment(raw, t) ?? localizeProductionOrder(raw, t);
}
