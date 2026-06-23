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

export type FlatCategoryOption = { id: number; label: string };

/** Flatten tree for combobox options with optional hierarchical prefix labels. */
export function flattenCategoryTree(
  nodes: CategoryTreeNode[],
  prefix = '',
  activeOnly = true,
): FlatCategoryOption[] {
  const out: FlatCategoryOption[] = [];
  for (const n of nodes) {
    if (activeOnly && n.is_active === false) {
      continue;
    }
    out.push({ id: n.id, label: prefix + n.name });
    if (n.children?.length) {
      out.push(...flattenCategoryTree(n.children, `${prefix + n.name} / `, activeOnly));
    }
  }
  return out;
}

/** Collect all descendant category ids under a node (not including the node itself). */
export function collectDescendantIds(node: CategoryTreeNode | null): Set<number> {
  const ids = new Set<number>();
  if (!node) return ids;

  function walk(n: CategoryTreeNode) {
    for (const ch of n.children ?? []) {
      ids.add(ch.id);
      walk(ch);
    }
  }

  walk(node);
  return ids;
}
