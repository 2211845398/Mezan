import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';

import type { ChartAccountTreeNode } from '../../api';
import { filterCoaForestHideZero } from '../../lib/coaHideZero';
import type { CoaStatementPanel } from '../../lib/coaStatementPanels';
import { CoaTreeTable, collectExpandableIds } from './CoaTreeTable';

type Props = {
  panel: CoaStatementPanel;
  titleKey: 'coa.balance_sheet' | 'coa.income_statement';
  forest: ChartAccountTreeNode[];
  showBalances?: boolean;
  branchId?: number | null;
  hideZeroAvailable?: boolean;
  onNewGroup: (panel: CoaStatementPanel) => void;
  onNewAccount: (panel: CoaStatementPanel) => void;
  onEdit: (node: ChartAccountTreeNode) => void;
  onDelete?: (node: ChartAccountTreeNode) => void;
};

export function CoaPanel({
  panel,
  titleKey,
  forest,
  showBalances = false,
  branchId = null,
  hideZeroAvailable = false,
  onNewGroup,
  onNewAccount,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation('accounting');
  const canCreate = usePermission('accounting', 'create');
  const canUpdate = usePermission('accounting', 'update');
  const canDelete = usePermission('accounting', 'delete');

  const [hideZero, setHideZero] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

  const displayForest = useMemo(() => {
    if (!hideZeroAvailable || !hideZero || !showBalances) return forest;
    return filterCoaForestHideZero(forest);
  }, [forest, hideZero, hideZeroAvailable, showBalances]);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(collectExpandableIds(displayForest)));
  }, [displayForest]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  return (
    <Card className="flex min-h-[420px] flex-col">
      <CardHeader className="flex flex-col gap-3 space-y-0 border-b pb-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg font-semibold">{t(titleKey)}</CardTitle>
          {canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onNewGroup(panel)}>
                {t('coa.new_group')}
              </Button>
              <Button type="button" size="sm" onClick={() => onNewAccount(panel)}>
                {t('coa.new_account')}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={expandAll}>
            {t('coa.expand_all')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={collapseAll}>
            {t('coa.collapse_all')}
          </Button>
          {hideZeroAvailable && showBalances ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`coa-hide-zero-${panel}`}
                checked={hideZero}
                onCheckedChange={(v) => setHideZero(v === true)}
              />
              <Label htmlFor={`coa-hide-zero-${panel}`} className="text-sm font-normal">
                {t('coa.hide_zero')}
              </Label>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-x-auto p-0 pt-0">
        <CoaTreeTable
          forest={displayForest}
          onEdit={onEdit}
          {...(onDelete ? { onDelete } : {})}
          canEdit={canUpdate}
          canDelete={canDelete}
          showBalances={showBalances}
          branchId={branchId}
          expandedIds={expandedIds}
          onExpandedIdsChange={setExpandedIds}
        />
      </CardContent>
    </Card>
  );
}
