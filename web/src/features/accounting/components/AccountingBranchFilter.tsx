import { BranchCombobox } from '@/features/admin/components/BranchCombobox';

export type AccountingBranchFilterProps = {
  value: number | null;
  onChange: (branchId: number | null) => void;
  disabled?: boolean;
  className?: string;
  clearLabel: string;
  /** Show branch code in trigger and list (default true). */
  showCode?: boolean;
};

/** Searchable branch picker with "all branches" (null). */
export function AccountingBranchFilter({
  value,
  onChange,
  disabled,
  className,
  clearLabel,
  showCode = true,
}: AccountingBranchFilterProps) {
  return (
    <BranchCombobox
      value={value}
      onChange={onChange}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(className !== undefined ? { className } : {})}
      allowClear
      clearLabel={clearLabel}
      includeArchived={false}
      showCode={showCode}
    />
  );
}
