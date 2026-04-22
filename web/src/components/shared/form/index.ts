export { Form, applyBackendFieldErrors } from './Form';
export { MoneyInput } from './MoneyInput';
export { DateField } from './DateField';
export { UnsavedChangesPrompt } from './UnsavedChangesPrompt';
export { Select, AsyncSelect } from './Select';
export type { SelectOption, SelectProps, AsyncSelectProps } from './Select';

// Thin re-exports of the shadcn form primitives so feature code can do
// `import { FormField, FormItem, FormLabel, FormControl, FormMessage } from
// '@/components/shared/form'`.
export {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/components/ui/form';
