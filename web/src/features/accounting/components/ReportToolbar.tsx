import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';

type Props = {
  branchId: string;
  onBranchIdChange: (v: string) => void;
  onApply: () => void;
  children?: React.ReactNode;
  applyLabel?: string;
};

export default function ReportToolbar({
  branchId,
  onBranchIdChange,
  onApply,
  children,
  applyLabel,
}: Props) {
  const { t } = useTranslation('accounting');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  return (
    <div className="flex flex-wrap items-end gap-3">
      {children}
      <div className="grid gap-1">
        <Label>{t('toolbar.branch')}</Label>
        <Select value={branchId} onValueChange={onBranchIdChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t('toolbar.all_branches')}</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" onClick={onApply}>
        {applyLabel ?? t('toolbar.apply')}
      </Button>
    </div>
  );
}
