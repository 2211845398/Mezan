import type { CategoryTreeNode } from '../api';

/** Filter inactive categories out of the tree (and their subtrees). */
export function filterActiveCategoryTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return nodes
    .filter((n) => n.is_active)
    .map((n) => ({
      ...n,
      children: filterActiveCategoryTree(n.children ?? []),
    }));
}

export function findCategoryNode(nodes: CategoryTreeNode[], id: number): CategoryTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const ch = findCategoryNode(n.children ?? [], id);
    if (ch) return ch;
  }
  return null;
}
