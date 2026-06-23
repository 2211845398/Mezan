import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import {
  FloatingFormDialog,
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { CategoryCombobox, type CategoryOption } from '@/features/catalog/components/CategoryCombobox';
import { useCategoryTreeQuery } from '@/features/catalog/queries';
import { handleDialogFormEnterSubmit } from '@/lib/formSubmitOnEnter';

import { createStockCountSession, downloadStockCountSessionPdf } from '../api';
import { inventoryKeys } from '../queries';
import { StockCountAssigneeCombobox, type StockCountAssignee } from './StockCountAssigneeCombobox';

const ISSUE_FORM_ID = 'stock-count-issue-form';

function flattenCats(nodes: { id: number; name: string; children?: typeof nodes }[]): CategoryOption[] {
  const o: CategoryOption[] = [];
  for (const n of nodes) {
    o.push({ id: n.id, label: n.name });
    if (n.children?.length) o.push(...flattenCats(n.children));
  }
  return o;
}

type StockCountIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StockCountIssueDialog({ open, onOpenChange }: StockCountIssueDialogProps) {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const { data: tree = [] } = useCategoryTreeQuery();
  const cats = flattenCats(tree);

  const [branchId, setBranchId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categorySubtree, setCategorySubtree] = useState(false);
  const [assignee, setAssignee] = useState<StockCountAssignee | null>(null);

  useEffect(() => {
    if (!open) {
      setBranchId(null);
      setCategoryId(null);
      setCategorySubtree(false);
      setAssignee(null);
    }
  }, [open]);

  const issueM = useMutation({
    mutationFn: async () => {
      if (branchId == null || assignee == null) throw new Error('branch');
      const detail = await createStockCountSession({
        branch_id: branchId,
        category_id: categoryId,
        category_include_descendants: categorySubtree,
        assigned_user_id: assignee.userId,
        responsible_name: assignee.name,
      });
      await downloadStockCountSessionPdf(detail.id);
      return detail;
    },
    onSuccess: async (detail) => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('movement.stock_count.issued', { version: detail.version_no }));
      onOpenChange(false);
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('movement.stock_count.issue_page_title')}
      maxWidth="lg"
      footer={
        <>
          <Button
            type="submit"
            form={ISSUE_FORM_ID}
            disabled={issueM.isPending || branchId == null || assignee == null}
            className={floatingFormApproveButtonClassName}
          >
            {t('movement.stock_count.issue_submit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={issueM.isPending}
            onClick={() => onOpenChange(false)}
            className={floatingFormCloseButtonClassName}
          >
            {tc('actions.cancel')}
          </Button>
        </>
      }
    >
      <form
        id={ISSUE_FORM_ID}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (issueM.isPending || branchId == null || assignee == null) return;
          void issueM.mutate();
        }}
        onKeyDown={handleDialogFormEnterSubmit}
      >
        <BranchCombobox
          label={t('adjustments.field.branch')}
          value={branchId}
          onChange={(id) => {
            setBranchId(id);
          }}
          showCode={false}
        />
        <StockCountAssigneeCombobox
          label={t('movement.stock_count.responsible')}
          value={assignee}
          onChange={setAssignee}
        />
        <div className="space-y-2">
          <Label className="text-sm">{t('stock.filter.category')}</Label>
          <CategoryCombobox value={categoryId} onChange={setCategoryId} options={cats} allowAll />
          <div className="flex items-center gap-2">
            <Switch
              id="stock-count-subtree-dialog"
              checked={categorySubtree}
              disabled={categoryId == null}
              onCheckedChange={setCategorySubtree}
            />
            <Label htmlFor="stock-count-subtree-dialog" className="text-sm font-normal">
              {t('movement.stock_count.include_subcategories')}
            </Label>
          </div>
        </div>
      </form>
    </FloatingFormDialog>
  );
}
