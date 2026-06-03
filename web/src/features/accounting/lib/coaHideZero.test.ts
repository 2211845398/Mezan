import { describe, expect, it } from 'vitest';

import type { ChartAccountTreeNode } from '../api';
import { filterCoaForestHideZero } from './coaHideZero';

function n(
  partial: Partial<ChartAccountTreeNode> & Pick<ChartAccountTreeNode, 'id' | 'code' | 'name' | 'account_type'>,
): ChartAccountTreeNode {
  return {
    parent_id: null,
    is_control: false,
    is_leaf: true,
    is_system: false,
    active: true,
    depth: 0,
    subledger_kind: 'none',
    children: [],
    ...partial,
  } as ChartAccountTreeNode;
}

describe('filterCoaForestHideZero', () => {
  it('removes zero-balance leaves but keeps parents with non-zero children', () => {
    const forest: ChartAccountTreeNode[] = [
      n({
        id: 1,
        code: '10000',
        name: 'Assets',
        account_type: 'asset',
        is_control: true,
        is_leaf: false,
        branch_subtree_net: '10',
        children: [
          n({
            id: 2,
            code: '10100',
            name: 'Cash grp',
            account_type: 'asset',
            is_control: true,
            branch_subtree_net: '10',
            children: [
              n({
                id: 3,
                code: '1000',
                name: 'Cash',
                account_type: 'asset',
                branch_subtree_net: '10',
                branch_net: '10',
              }),
              n({
                id: 4,
                code: '1010',
                name: 'Card',
                account_type: 'asset',
                branch_subtree_net: '0',
                branch_net: '0',
              }),
            ],
          }),
        ],
      }),
    ];
    const filtered = filterCoaForestHideZero(forest);
    expect(filtered).toHaveLength(1);
    const cashGrp = filtered[0]?.children?.[0];
    expect(cashGrp?.children).toHaveLength(1);
    expect(cashGrp?.children?.[0]?.code).toBe('1000');
  });
});
