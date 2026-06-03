import { describe, expect, it } from 'vitest';

import type { ChartAccountRead, ChartAccountTreeNode } from '../api';
import { filterForestByPanel, filterGroupParentOptions } from './coaStatementPanels';

function node(partial: Partial<ChartAccountTreeNode> & Pick<ChartAccountTreeNode, 'id' | 'code' | 'name' | 'account_type'>): ChartAccountTreeNode {
  return {
    is_control: true,
    is_leaf: false,
    subledger_kind: 'none',
    is_system: false,
    active: true,
    depth: 1,
    children: [],
    ...partial,
  } as ChartAccountTreeNode;
}

describe('filterForestByPanel', () => {
  it('splits balance sheet and income statement roots', () => {
    const forest = [
      node({ id: 1, code: '1', name: 'Assets', account_type: 'asset' }),
      node({ id: 2, code: '4', name: 'Revenue', account_type: 'revenue' }),
      node({ id: 3, code: '2', name: 'Liabilities', account_type: 'liability' }),
    ];
    expect(filterForestByPanel(forest, 'balance_sheet').map((n) => n.id)).toEqual([1, 3]);
    expect(filterForestByPanel(forest, 'income_statement').map((n) => n.id)).toEqual([2]);
  });
});

describe('filterGroupParentOptions', () => {
  it('keeps control accounts in the same statement panel', () => {
    const accounts: ChartAccountRead[] = [
      {
        id: 1,
        code: '1',
        name: 'Assets',
        account_type: 'asset',
        parent_id: null,
        is_control: true,
        is_leaf: false,
        subledger_kind: 'none',
        is_system: false,
        active: true,
        depth: 1,
      },
      {
        id: 2,
        code: '11',
        name: 'Current',
        account_type: 'asset',
        parent_id: 1,
        is_control: true,
        is_leaf: false,
        subledger_kind: 'none',
        is_system: false,
        active: true,
        depth: 2,
      },
      {
        id: 3,
        code: '4',
        name: 'Revenue',
        account_type: 'revenue',
        parent_id: null,
        is_control: true,
        is_leaf: false,
        subledger_kind: 'none',
        is_system: false,
        active: true,
        depth: 1,
      },
    ];
    const bs = filterGroupParentOptions(accounts, 'balance_sheet');
    expect(bs.map((a) => a.id).sort()).toEqual([1, 2]);
    const pl = filterGroupParentOptions(accounts, 'income_statement');
    expect(pl.map((a) => a.id)).toEqual([3]);
  });
});
