import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { ChartAccountTreeNode } from '../../api';
import { buildLedgerDrillDownUrl } from '../../lib/ledgerDrillDownUrl';
import { now, utcCalendarDayKey } from '@/lib/date';

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

function collectExpandableIds(nodes: ChartAccountTreeNode[]): number[] {
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
  canEdit: boolean;
};

export function CoaTreeTable({ forest, onEdit, canEdit }: Props) {
  const { t } = useTranslation('accounting');
  const asOf = useMemo(() => utcCalendarDayKey(now()), []);

  const defaultExpanded = useMemo(() => new Set(collectExpandableIds(forest)), [forest]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(defaultExpanded);

  const toggle = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
          <TableHead className="w-[45%]">{t('coa.col.name')}</TableHead>
          <TableHead className="w-[25%]">{t('coa.col.code')}</TableHead>
          <TableHead className="w-[30%] text-end">{t('coa.col.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ node, depth }) => {
          const hasChildren = (node.children?.length ?? 0) > 0;
          const isGroup = node.is_control || !node.is_leaf;
          const glHref =
            node.is_leaf && !node.is_control
              ? buildLedgerDrillDownUrl({
                  account_id: node.id,
                  date_from: `${asOf.slice(0, 4)}-01-01`,
                  date_to: asOf,
                })
              : null;

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
                    <a
                      href={glHref}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'truncate text-sm hover:underline',
                        isGroup ? 'font-semibold text-foreground' : 'text-primary',
                      )}
                    >
                      {node.name}
                    </a>
                  ) : (
                    <span
                      className={cn(
                        'truncate text-sm',
                        isGroup ? 'font-semibold' : 'font-normal text-foreground',
                      )}
                    >
                      {node.name}
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
              <TableCell className="text-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || node.is_system}
                  onClick={() => onEdit(node)}
                >
                  {t('coa.edit')}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
