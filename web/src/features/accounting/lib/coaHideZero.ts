import type { ChartAccountTreeNode } from '../api';

const ZERO_EPS = 0.005;

export function hasCoaBranchBalance(node: ChartAccountTreeNode): boolean {
  const net = Number(node.branch_subtree_net ?? node.branch_net ?? 0);
  return Math.abs(net) >= ZERO_EPS;
}

/** Drop nodes whose rolled-up branch balance is zero (keeps parents when a child has balance). */
export function filterCoaForestHideZero(forest: ChartAccountTreeNode[]): ChartAccountTreeNode[] {
  const walk = (nodes: ChartAccountTreeNode[]): ChartAccountTreeNode[] => {
    const out: ChartAccountTreeNode[] = [];
    for (const node of nodes) {
      const children = walk(node.children ?? []);
      if (!hasCoaBranchBalance(node) && children.length === 0) {
        continue;
      }
      out.push({ ...node, children });
    }
    return out;
  };
  return walk(forest);
}
