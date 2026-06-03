import { describe, expect, it } from 'vitest';

import { formatSupplierStatementDescription } from './supplierStatementDescription';

const t = ((key: string, opts?: { id?: string }) => {
  if (key === 'suppliers.statement.desc.goods_receipt') return `استلام بضاعة رقم ${opts?.id}`;
  if (key === 'suppliers.statement.desc.ap_payment') return `دفعة للمورد رقم ${opts?.id}`;
  return key;
}) as never;

describe('formatSupplierStatementDescription', () => {
  it('localizes goods_receipt by source_type in Arabic', () => {
    expect(
      formatSupplierStatementDescription(
        { description: 'Goods receipt 4', source_type: 'goods_receipt', source_id: '4' },
        t,
        'ar',
      ),
    ).toBe('استلام بضاعة رقم 4');
  });

  it('keeps English description when locale is en', () => {
    expect(
      formatSupplierStatementDescription(
        { description: 'Goods receipt 4', source_type: 'goods_receipt', source_id: '4' },
        t,
        'en',
      ),
    ).toBe('Goods receipt 4');
  });
});
