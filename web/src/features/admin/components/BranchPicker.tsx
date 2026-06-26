import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useBranches } from '../queries';
import type { BranchRead } from '../types';

/** Radix Select forbids `SelectItem value=""`; use a sentinel for “no branch”. */
const NO_BRANCH = '__no_branch__';

type Props = {
  value: number | null | undefined;
  onChange: (branchId: number | null) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
  allowClear?: boolean;
  /** If true, include archived branches in the list. */
  includeArchived?: boolean;
  /** When set, only branches of this kind are listed. */
  kind?: 'commercial' | 'warehouse';
};

export function BranchPicker({
  value,
  onChange,
  disabled,
  id,
  label,
  allowClear,
  includeArchived = false,
  kind,
}: Props) {
  const { t } = useTranslation('admin');
  const { data: branches = [], isLoading } = useBranches(
    includeArchived,
    kind ? { kind } : {},
  );

  return (
    <div className="space-y-2">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select
        value={
          value == null || value === 0
            ? allowClear
              ? NO_BRANCH
              : ''
            : String(value)
        }
        onValueChange={(v) => {
          if (v === NO_BRANCH) onChange(allowClear ? null : 0);
          else onChange(Number(v));
        }}
        disabled={disabled || isLoading}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={t('branches.picker_placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {allowClear ? (
            <SelectItem value={NO_BRANCH}>{t('branches.picker_clear')}</SelectItem>
          ) : null}
          {branches.map((b: BranchRead) => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.code} — {b.name}
              {b.archived_at ? ` (${t('branches.archived_badge')})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
