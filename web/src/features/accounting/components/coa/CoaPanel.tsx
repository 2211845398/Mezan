import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermission } from '@/hooks/usePermission';

import type { ChartAccountTreeNode } from '../../api';
import type { CoaStatementPanel } from '../../lib/coaStatementPanels';
import { CoaTreeTable } from './CoaTreeTable';

type Props = {
  panel: CoaStatementPanel;
  titleKey: 'coa.balance_sheet' | 'coa.income_statement';
  forest: ChartAccountTreeNode[];
  onNewGroup: (panel: CoaStatementPanel) => void;
  onNewAccount: (panel: CoaStatementPanel) => void;
  onEdit: (node: ChartAccountTreeNode) => void;
};

export function CoaPanel({
  panel,
  titleKey,
  forest,
  onNewGroup,
  onNewAccount,
  onEdit,
}: Props) {
  const { t } = useTranslation('accounting');
  const canCreate = usePermission('accounting', 'create');
  const canUpdate = usePermission('accounting', 'update');

  return (
    <Card className="flex min-h-[420px] flex-col">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b pb-4">
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
      </CardHeader>
      <CardContent className="flex-1 overflow-x-auto p-0 pt-0">
        <CoaTreeTable forest={forest} onEdit={onEdit} canEdit={canUpdate} />
      </CardContent>
    </Card>
  );
}
