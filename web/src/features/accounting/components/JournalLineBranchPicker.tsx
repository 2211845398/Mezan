import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { cn } from '@/lib/utils';

type Props = {
  value: number | null | undefined;
  onChange: (branchId: number) => void;
  disabled?: boolean;
  className?: string;
};

/** Compact searchable branch picker for journal line grids. */
export function JournalLineBranchPicker({ value, onChange, disabled, className }: Props) {
  return (
    <BranchCombobox
      value={value}
      onChange={(id) => {
        if (id != null) onChange(id);
      }}
      disabled={disabled}
      showCode={false}
      includeArchived={false}
      className={cn('min-w-[120px]', className)}
    />
  );
}
