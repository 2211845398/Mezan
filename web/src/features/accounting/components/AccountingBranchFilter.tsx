import { BranchCombobox } from '@/features/admin/components/BranchCombobox';

export type AccountingBranchFilterProps = {
  value: number | null;
  onChange: (branchId: number | null) => void;
  disabled?: boolean;
  className?: string;
  /** Label for the "all branches" clear option (required when allowClear is true). */
  clearLabel?: string;
  /** Allow clearing selection to null (default true). */
  allowClear?: boolean;
  /** Show branch code in trigger and list (default true). */
  showCode?: boolean;
  /** Show only branch names (no codes, no #id fallback styling). */
  namesOnly?: boolean;
};

/** Searchable branch picker with optional "all branches" (null). */
export function AccountingBranchFilter({
  value,
  onChange,
  disabled,
  className,
  clearLabel,
  allowClear = true,
  showCode = true,
  namesOnly = false,
}: AccountingBranchFilterProps) {
  return (
    <BranchCombobox
      value={value}
      onChange={onChange}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(className !== undefined ? { className } : {})}
      allowClear={allowClear}
      {...(allowClear && clearLabel !== undefined ? { clearLabel } : {})}
      includeArchived={false}
      showCode={namesOnly ? false : showCode}
      namesOnly={namesOnly}
    />
  );
}
