import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { FloatingFormDialog, floatingFormApproveButtonClassName, floatingFormCloseButtonClassName } from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type {
  ChartAccountRead,
  ChartAccountTreeNode,
  SubledgerKind,
} from '../../api';
import {
  createChartAccount,
  suggestChartAccountCode,
  updateChartAccount,
} from '../../api';
import {
  filterGroupParentOptions,
  inferAccountTypeForParent,
  type CoaStatementPanel,
} from '../../lib/coaStatementPanels';
import { suggestChildCodeClient } from '../../lib/coaSuggestCode';
import { accountingKeys } from '../../queries';
import { CoaParentGroupSelect } from './CoaParentGroupSelect';

const SUBLEDGER_OPTIONS: SubledgerKind[] = ['none', 'customer', 'supplier', 'employee'];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panel: CoaStatementPanel;
  accounts: ChartAccountRead[];
  editNode?: ChartAccountTreeNode | null;
  defaultParentId?: number | null;
};

export function CoaAccountDialog({
  open,
  onOpenChange,
  panel,
  accounts,
  editNode,
  defaultParentId,
}: Props) {
  const { t } = useTranslation('accounting');
  const qc = useQueryClient();
  const isEdit = editNode != null;

  const parentOptions = useMemo(
    () => filterGroupParentOptions(accounts, panel),
    [accounts, panel],
  );

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState<number | null>(defaultParentId ?? null);
  const [subledgerKind, setSubledgerKind] = useState<SubledgerKind>('none');

  useEffect(() => {
    if (!open) return;
    if (editNode) {
      setName(editNode.name);
      setCode(editNode.code);
      const row = accounts.find((a) => a.id === editNode.id);
      setParentId(row?.parent_id ?? null);
      setSubledgerKind((editNode.subledger_kind as SubledgerKind) ?? 'none');
    } else {
      setName('');
      setCode('');
      setParentId(defaultParentId ?? null);
      setSubledgerKind('none');
    }
  }, [open, editNode, accounts, defaultParentId]);

  useEffect(() => {
    if (!open || isEdit || parentId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await suggestChartAccountCode(parentId);
        if (!cancelled && res.suggested_code) setCode(res.suggested_code);
      } catch {
        const parent = accounts.find((a) => a.id === parentId);
        if (!parent) return;
        const siblings = accounts.filter((a) => a.parent_id === parentId).map((a) => a.code);
        if (!cancelled) setCode(suggestChildCodeClient(parent.code, siblings));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, parentId, accounts]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('coa.validation.name'));
      if (!code.trim()) throw new Error(t('coa.validation.code'));
      if (parentId == null) throw new Error(t('coa.validation.parent'));

      const accountType = inferAccountTypeForParent(parentId, accounts);
      if (!accountType) throw new Error(t('coa.validation.parent'));

      if (isEdit && editNode) {
        return updateChartAccount(editNode.id, {
          name: name.trim(),
          code: code.trim(),
          parent_id: parentId,
          is_control: false,
          subledger_kind: subledgerKind,
        });
      }
      return createChartAccount({
        name: name.trim(),
        code: code.trim(),
        parent_id: parentId,
        account_type: accountType,
        is_control: false,
        subledger_kind: subledgerKind,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.chartAccountsTree() });
      await qc.invalidateQueries({ queryKey: accountingKeys.chartAccounts() });
      await qc.invalidateQueries({ queryKey: accountingKeys.postableAccounts() });
      toast.success(isEdit ? t('coa.saved') : t('coa.created'));
      onOpenChange(false);
    },
    onError: (err) => notifyApiError(err),
  });

  const disabled = editNode?.is_system === true;

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('coa.account_edit_title') : t('coa.account_new_title')}
      maxWidth="md"
      footer={
        <>
          <Button
            type="button"
            disabled={saveMut.isPending || disabled}
            className={floatingFormApproveButtonClassName}
            onClick={() => saveMut.mutate()}
          >
            {isEdit ? t('coa.save') : t('coa.create')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saveMut.isPending}
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="coa-acct-name">{t('coa.name')}</Label>
          <Input
            id="coa-acct-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="coa-acct-code">{t('coa.code')}</Label>
          <Input
            id="coa-acct-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={disabled}
            className="font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t('coa.parent')}</Label>
          <CoaParentGroupSelect
            value={parentId}
            onChange={setParentId}
            options={parentOptions}
            disabled={disabled}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t('coa.subledger_kind')}</Label>
          <Select
            value={subledgerKind}
            onValueChange={(v) => setSubledgerKind(v as SubledgerKind)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBLEDGER_OPTIONS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`coa.subledger.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FloatingFormDialog>
  );
}
