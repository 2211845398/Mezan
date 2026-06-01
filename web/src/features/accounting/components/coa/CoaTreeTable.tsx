import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { now, utcCalendarDayKey } from '@/lib/date';

import type { ChartAccountTreeNode } from '../../api';
import { accountingMoneyCell, accountingMoneyHead } from '../../lib/accountingTableClasses';
import { resolveCoaDisplayName } from '../../lib/coaDisplayName';
import { buildLedgerDrillDownUrl } from '../../lib/ledgerDrillDownUrl';

type FlatRow = {
  node: ChartAccountTreeNode;
  depth: number;
};

function flattenVisible(
  nodes: ChartAccountTreeNode[],
  expandedIds: Set<number>,
  depth = 0,
): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    const children = node.children ?? [];
    if (children.length > 0 && expandedIds.has(node.id)) {
      rows.push(...flattenVisible(children, expandedIds, depth + 1));
    }
  }
  return rows;
}

export function collectExpandableIds(nodes: ChartAccountTreeNode[]): number[] {
  const ids: number[] = [];
  const walk = (list: ChartAccountTreeNode[]) => {
    for (const n of list) {
      if ((n.children?.length ?? 0) > 0) {
        ids.push(n.id);
        walk(n.children ?? []);
      }
    }
  };
  walk(nodes);
  return ids;
}

type Props = {
  forest: ChartAccountTreeNode[];
  onEdit: (node: ChartAccountTreeNode) => void;
  onDelete?: (node: ChartAccountTreeNode) => void;
  canEdit: boolean;
  canDelete?: boolean;
  showBalances?: boolean;
  branchId?: number | null;
  expandedIds: Set<number>;
  onExpandedIdsChange: (next: Set<number>) => void;
};

export function CoaTreeTable({
  forest,
  onEdit,
  onDelete,
  canEdit,
  canDelete = false,
  showBalances = false,
  branchId = null,
  expandedIds,
  onExpandedIdsChange,
}: Props) {
  const { t, i18n } = useTranslation('accounting');
  const asOf = useMemo(() => utcCalendarDayKey(now()), []);

  const toggle = useCallback(
    (id: number) => {
      const next = new Set(expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onExpandedIdsChange(next);
    },
    [expandedIds, onExpandedIdsChange],
  );

  const rows = useMemo(
    () => flattenVisible(forest, expandedIds),
    [forest, expandedIds],
  );

  if (forest.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('coa.empty')}</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={showBalances ? 'w-[40%]' : 'w-[45%]'}>{t('coa.col.name')}</TableHead>
          <TableHead className="w-[20%]">{t('coa.col.code')}</TableHead>
          {showBalances ? (
            <TableHead className={cn('w-[20%]', accountingMoneyHead)}>
              {t('coa.col.balance')}
            </TableHead>
          ) : null}
          <TableHead className={cn(showBalances ? 'w-[20%]' : 'w-[30%]', 'text-end')}>
            {t('coa.col.actions')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ node, depth }) => {
          const hasChildren = (node.children?.length ?? 0) > 0;
          const isGroup = node.is_control || !node.is_leaf;
          const displayName = resolveCoaDisplayName(node, i18n.language);
          const glHref =
            node.is_leaf && !node.is_control
              ? buildLedgerDrillDownUrl({
                  account_id: node.id,
                  date_from: `${asOf.slice(0, 4)}-01-01`,
                  date_to: asOf,
                  branch_id: branchId ?? undefined,
                })
              : null;
          const balanceNet = Number(node.branch_subtree_net ?? node.branch_net ?? 0);

          return (
            <TableRow key={node.id}>
              <TableCell>
                <div
                  className="flex items-center gap-1"
                  style={{ paddingInlineStart: depth * 16 }}
                >
                  {hasChildren ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={() => toggle(node.id)}
                      aria-label={expandedIds.has(node.id) ? t('coa.collapse') : t('coa.expand')}
                    >
                      {expandedIds.has(node.id) ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronLeft className="size-4 rtl:rotate-180" />
                      )}
                    </Button>
                  ) : (
                    <span className="inline-block size-7 shrink-0" />
                  )}
                  {glHref ? (
                    <Link
                      to={glHref}
                      className={cn(
                        'truncate text-sm underline-offset-4 hover:underline',
                        isGroup ? 'font-semibold text-foreground' : 'text-primary',
                      )}
                    >
                      {displayName}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        'truncate text-sm',
                        isGroup ? 'font-semibold' : 'font-normal text-foreground',
                      )}
                    >
                      {displayName}
                    </span>
                  )}
                  {node.is_system ? (
                    <span className="ms-1 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t('coa.system_account')}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{node.code}</TableCell>
              {showBalances ? (
                <TableCell>
                  <span className={accountingMoneyCell}>
                    {Math.abs(balanceNet) >= 0.005 ? formatMoney(balanceNet) : '—'}
                  </span>
                </TableCell>
              ) : null}
              <TableCell className="text-end">
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canEdit || node.is_system}
                    onClick={() => onEdit(node)}
                  >
                    {t('coa.edit')}
                  </Button>
                  {canDelete && onDelete ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={node.is_system}
                      onClick={() => onDelete(node)}
                    >
                      {t('coa.delete')}
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
