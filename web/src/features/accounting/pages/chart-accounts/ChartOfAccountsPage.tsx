import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ContentSurface } from '@/components/shared/ContentSurface';
import { PageHeader } from '@/components/shared/PageHeader';

import type { ChartAccountTreeNode } from '../../api';
import { CoaAccountDialog } from '../../components/coa/CoaAccountDialog';
import { CoaGroupDialog } from '../../components/coa/CoaGroupDialog';
import { CoaPanel } from '../../components/coa/CoaPanel';
import {
  filterForestByPanel,
  type CoaStatementPanel,
} from '../../lib/coaStatementPanels';
import { chartAccountsQueryOptions, chartAccountsTreeQueryOptions } from '../../queries';

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

  const treeQuery = useQuery(chartAccountsTreeQueryOptions(false));
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

  const groupOpen = dialog.kind === 'group';
  const accountOpen = dialog.kind === 'account';

  return (
    <div className="space-y-4">
      <PageHeader title={t('coa.title')} />
      <ContentSurface>
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
              onNewGroup={(panel) => setDialog({ kind: 'group', mode: 'create', panel })}
              onNewAccount={(panel) => setDialog({ kind: 'account', mode: 'create', panel })}
              onEdit={(node) => openEdit(node, 'income_statement')}
            />
            <CoaPanel
              panel="balance_sheet"
              titleKey="coa.balance_sheet"
              forest={balanceSheetForest}
              onNewGroup={(panel) => setDialog({ kind: 'group', mode: 'create', panel })}
              onNewAccount={(panel) => setDialog({ kind: 'account', mode: 'create', panel })}
              onEdit={(node) => openEdit(node, 'balance_sheet')}
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
    </div>
  );
}
