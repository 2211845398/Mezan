import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import type { ChartAccountTreeNode } from '../../api';
import { checkChartAccountDeletable, deleteChartAccount } from '../../api';
import { resolveCoaDisplayName } from '../../lib/coaDisplayName';
import { accountingKeys } from '../../queries';

const DELETE_REASON_I18N: Record<string, string> = {
  'Account balance must be zero': 'coa.delete_reason.balance_not_zero',
  'Account has posted journal entries': 'coa.delete_reason.has_journal_entries',
  'System accounts cannot be deleted': 'coa.delete_reason.system_account',
  'Account not found': 'coa.delete_reason.not_found',
};

type Props = {
  node: ChartAccountTreeNode | null;
  onClose: () => void;
};

export function CoaDeleteDialog({ node, onClose }: Props) {
  const { t, i18n } = useTranslation('accounting');
  const qc = useQueryClient();
  const open = node != null;
  const accountId = node?.id ?? 0;

  const checkQuery = useQuery({
    queryKey: [...accountingKeys.chartAccounts(), 'can-delete', accountId] as const,
    queryFn: () => checkChartAccountDeletable(accountId),
    enabled: open && accountId > 0,
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteChartAccount(accountId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.chartAccountsTree() });
      await qc.invalidateQueries({ queryKey: [...accountingKeys.root, 'chart-accounts', 'by-branch'] });
      await qc.invalidateQueries({ queryKey: accountingKeys.chartAccounts() });
      await qc.invalidateQueries({ queryKey: accountingKeys.postableAccounts() });
      toast.success(t('coa.deleted'));
      onClose();
    },
    onError: (err) => notifyApiError(err),
  });

  const label = node ? resolveCoaDisplayName(node, i18n.language) : '';
  const canDelete = checkQuery.data?.can_delete === true;
  const rawReason = checkQuery.data?.reason ?? '';
  const reasonKey = DELETE_REASON_I18N[rawReason];
  const reason = reasonKey ? t(reasonKey) : rawReason;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('coa.delete_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {checkQuery.isLoading
              ? t('coa.delete_checking')
              : canDelete
                ? t('coa.delete_confirm', { name: label, code: node?.code ?? '' })
                : t('coa.delete_blocked', { reason })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMut.isPending}>{t('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canDelete || deleteMut.isPending || checkQuery.isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              deleteMut.mutate();
            }}
          >
            {t('coa.delete_action')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
