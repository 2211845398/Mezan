import Decimal from 'decimal.js';

import type { GoodsReceiptRead } from '../api';

/** Weighted-average unit cost received per PO line (null when nothing received yet). */
export function aggregateReceivedUnitCostByPoLine(
  receipts: GoodsReceiptRead[],
): Record<number, string | null> {
  const qtyByLine: Record<number, Decimal> = {};
  const costByLine: Record<number, Decimal> = {};

  for (const r of receipts) {
    for (const ln of r.lines ?? []) {
      const polId = ln.purchase_order_line_id;
      if (polId == null) continue;
      const qty = new Decimal(ln.qty);
      const lineCost = new Decimal(String(ln.unit_cost)).mul(qty);
      qtyByLine[polId] = (qtyByLine[polId] ?? new Decimal(0)).plus(qty);
      costByLine[polId] = (costByLine[polId] ?? new Decimal(0)).plus(lineCost);
    }
  }

  const out: Record<number, string | null> = {};
  for (const polId of Object.keys(qtyByLine)) {
    const id = Number(polId);
    const qty = qtyByLine[id];
    const cost = costByLine[id];
    if (qty == null || cost == null || qty.lte(0)) {
      out[id] = null;
      continue;
    }
    out[id] = cost.div(qty).toFixed(4);
  }
  return out;
}
