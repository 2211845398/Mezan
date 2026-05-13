import type { GoodsReceiptRead } from '../api';

export function aggregateReceivedQtyByPoLine(receipts: GoodsReceiptRead[]): Record<number, number> {
  const m: Record<number, number> = {};
  for (const r of receipts) {
    for (const ln of r.lines ?? []) {
      const polId = ln.purchase_order_line_id;
      if (polId == null) continue;
      m[polId] = (m[polId] ?? 0) + ln.qty;
    }
  }
  return m;
}
