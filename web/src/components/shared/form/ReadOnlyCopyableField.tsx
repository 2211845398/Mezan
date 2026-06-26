import { Input } from '@/components/ui/input';
import { readOnlyFieldClassName } from '@/lib/readOnlyFieldStyles';
import { cn } from '@/lib/utils';

export type ReadOnlyCopyableFieldProps = {
  value: string;
  className?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
  id?: string;
};

/** Read-only text display for select/combobox values — copyable, same visual as detail inputs. */
export function ReadOnlyCopyableField({
  value,
  className,
  dir,
  id,
}: ReadOnlyCopyableFieldProps) {
  return (
    <Input
      id={id}
      readOnly
      tabIndex={0}
      value={value}
      dir={dir}
      className={cn(readOnlyFieldClassName, 'text-start', className)}
    />
  );
}
