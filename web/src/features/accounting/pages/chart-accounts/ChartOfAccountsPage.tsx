import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ContentSurface } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { now, utcCalendarDayKey } from '@/lib/date';

import type { ChartAccountTreeNode } from '../../api';
import { AccountingBranchFilter } from '../../components/AccountingBranchFilter';
import { CoaAccountDialog } from '../../components/coa/CoaAccountDialog';
import { CoaDeleteDialog } from '../../components/coa/CoaDeleteDialog';
import { CoaGroupDialog } from '../../components/coa/CoaGroupDialog';
import { CoaPanel } from '../../components/coa/CoaPanel';
import {
  filterForestByPanel,
  type CoaStatementPanel,
} from '../../lib/coaStatementPanels';
import {
  chartAccountsQueryOptions,
  chartAccountsTreeByBranchQueryOptions,
  chartAccountsTreeQueryOptions,
} from '../../queries';

type DialogState =
  | { kind: 'closed' }
  | {
      kind: 'group';
      mode: 'create' | 'edit';
      panel: CoaStatementPanel;
      node?: ChartAccountTreeNode;
    }
  | {
      kind: 'account';
      mode: 'create' | 'edit';
      panel: CoaStatementPanel;
      node?: ChartAccountTreeNode;
    };

export default function ChartOfAccountsPage() {
  const { t } = useTranslation('accounting');
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [deleteNode, setDeleteNode] = useState<ChartAccountTreeNode | null>(null);

  const defaultAsOf = useMemo(() => utcCalendarDayKey(now()), []);
  const [asOf, setAsOf] = useState(defaultAsOf);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [applied, setApplied] = useState<{ as_of: string; branch_id: number | null }>({
    as_of: defaultAsOf,
    branch_id: null,
  });

  const showBalances = applied.branch_id != null;

  const branchTreeQuery = useQuery({
    ...chartAccountsTreeByBranchQueryOptions({
      branch_id: applied.branch_id ?? 0,
      as_of: applied.as_of,
      active_only: false,
    }),
    enabled: applied.branch_id != null,
  });
  const globalTreeQuery = useQuery(chartAccountsTreeQueryOptions(false));
  const treeQuery = showBalances ? branchTreeQuery : globalTreeQuery;
  const accountsQuery = useQuery(chartAccountsQueryOptions(true));

  const forest = treeQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];

  const balanceSheetForest = useMemo(
    () => filterForestByPanel(forest, 'balance_sheet'),
    [forest],
  );
  const incomeForest = useMemo(
    () => filterForestByPanel(forest, 'income_statement'),
    [forest],
  );

  const openEdit = (node: ChartAccountTreeNode, panel: CoaStatementPanel) => {
    if (node.is_control || !node.is_leaf) {
      setDialog({ kind: 'group', mode: 'edit', panel, node });
    } else {
      setDialog({ kind: 'account', mode: 'edit', panel, node });
    }
  };

  const applyFilters = () => {
    setApplied({ as_of: asOf, branch_id: branchId });
  };

  const groupOpen = dialog.kind === 'group';
  const accountOpen = dialog.kind === 'account';

  return (
    <div className="space-y-4">
      <PageHeader title={t('coa.title')} />
      <ContentSurface className="space-y-6 p-4">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('coa.as_of')}</span>
            <DateField value={asOf} onChange={setAsOf} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('coa.branch_filter')}</Label>
            <AccountingBranchFilter
              value={branchId}
              onChange={setBranchId}
              clearLabel={t('coa.branch_all')}
              className="w-[220px]"
            />
          </div>
          <Button type="button" size="sm" onClick={applyFilters}>
            {t('coa.apply_filters')}
          </Button>
        </div>
        {treeQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('coa.loading')}</p>
        ) : treeQuery.isError ? (
          <p className="text-sm text-destructive">{t('errors.generic')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CoaPanel
              panel="income_statement"
              titleKey="coa.income_statement"
              forest={incomeForest}
              showBalances={showBalances}
              branchId={applied.branch_id}
              hideZeroAvailable={showBalances}
              onNewGroup={(panel) => setDialog({ kind: 'group', mode: 'create', panel })}
              onNewAccount={(panel) => setDialog({ kind: 'account', mode: 'create', panel })}
              onEdit={(node) => openEdit(node, 'income_statement')}
              onDelete={setDeleteNode}
            />
            <CoaPanel
              panel="balance_sheet"
              titleKey="coa.balance_sheet"
              forest={balanceSheetForest}
              showBalances={showBalances}
              branchId={applied.branch_id}
              hideZeroAvailable={showBalances}
              onNewGroup={(panel) => setDialog({ kind: 'group', mode: 'create', panel })}
              onNewAccount={(panel) => setDialog({ kind: 'account', mode: 'create', panel })}
              onEdit={(node) => openEdit(node, 'balance_sheet')}
              onDelete={setDeleteNode}
            />
          </div>
        )}
      </ContentSurface>

      <CoaGroupDialog
        open={groupOpen}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: 'closed' });
        }}
        panel={dialog.kind === 'group' ? dialog.panel : 'balance_sheet'}
        accounts={accounts}
        editNode={
          dialog.kind === 'group' && dialog.mode === 'edit' && dialog.node ? dialog.node : null
        }
      />

      <CoaAccountDialog
        open={accountOpen}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: 'closed' });
        }}
        panel={dialog.kind === 'account' ? dialog.panel : 'balance_sheet'}
        accounts={accounts}
        editNode={
          dialog.kind === 'account' && dialog.mode === 'edit' && dialog.node ? dialog.node : null
        }
      />

      <CoaDeleteDialog node={deleteNode} onClose={() => setDeleteNode(null)} />
    </div>
  );
}
