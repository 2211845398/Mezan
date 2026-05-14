// Shared components library — single source of truth for cross-cutting UI.

// Charts
export * from './charts';

// Form primitives
export type { AsyncSelectProps, SelectOption, SelectProps } from './form';
export {
  applyBackendFieldErrors,
  AsyncSelect,
  DateField,
  Form,
  handleFormApiError,
  MoneyInput,
  Select,
  UnsavedChangesPrompt,
} from './form';

// Re-export shadcn form primitives for convenience
export {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
export { useFormField } from '@/components/ui/use-form-field';

// DataTable
export type { DataTableColumn,DataTableProps } from './DataTable';
export { DataTable } from './DataTable';
export { defineColumns } from './DataTable/columns';

// Shared UI patterns
export type { ContentSurfaceProps, FormContainerProps,SectionCardProps } from './ContentSurface';
export { ContentSurface, FormContainer,SectionCard } from './ContentSurface';
export type { FloatingFormActionsProps, FloatingFormDialogProps } from './FloatingFormDialog';
export {
  FloatingFormActions,
  floatingFormApproveButtonClassName,
  floatingFormApproveButtonSmClassName,
  floatingFormCloseButtonClassName,
  floatingFormCloseButtonSmClassName,
  floatingFormDangerButtonClassName,
  floatingFormDangerButtonSmClassName,
  FloatingFormDialog,
} from './FloatingFormDialog';
export type { BackButtonProps,CreateButtonProps, PageHeaderProps } from './PageHeader';
export { BackButton,CreateButton, PageHeader } from './PageHeader';

// Permission-based rendering
export { Can } from './Can';

// Other shared components
export { default as FeatureStub } from './FeatureStub';
export { FileDrop } from './FileDrop';
export { toFormDataWithFile } from './fileDropHelpers';
export { OfflineBadge } from './OfflineBadge';
export { ThemeToggle } from './ThemeToggle';
