import { describe, expect, it } from 'vitest';

import type { ChartAccountRead } from '../api';
import { filterPayableSupplierAccounts } from './payableAccountOptions';

function acct(partial: Partial<ChartAccountRead> & Pick<ChartAccountRead, 'id' | 'code' | 'name'>): ChartAccountRead {
  return {
    account_type: 'liability',
    active: true,
    is_control: false,
    is_system: true,
    parent_id: null,
    ...partial,
  } as ChartAccountRead;
}

describe('filterPayableSupplierAccounts', () => {
  it('keeps leaf trade AP and drops control, cash, loyalty, revenue', () => {
    const rows = [
      acct({ id: 1, code: '1000', name: 'Cash', account_type: 'asset' }),
      acct({ id: 2, code: '2000', name: 'AP summary', account_type: 'liability', is_control: true }),
      acct({ id: 5, code: '2010', name: 'Trade Payables', account_type: 'liability' }),
      acct({ id: 3, code: '2150', name: 'Loyalty', account_type: 'liability' }),
      acct({ id: 4, code: '4000', name: 'Sales', account_type: 'revenue' }),
    ];
    const filtered = filterPayableSupplierAccounts(rows);
    expect(filtered.map((a) => a.code)).toEqual(['2010']);
  });
});
