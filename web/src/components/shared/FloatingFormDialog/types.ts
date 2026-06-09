import type { ReactNode } from 'react';

export type FloatingFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
};

export type FloatingFormActionsProps = {
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
};

export type FloatingFormDialogFooterProps = {
  onCancel: () => void;
  saveLabel: string;
  cancelLabel: string;
  /** When set, the save button submits this form by id. */
  formId?: string;
  /** Used when `formId` is not set (e.g. imperative submit handlers). */
  onSave?: () => void;
  isSubmitting?: boolean;
  saveDisabled?: boolean;
  extraActions?: ReactNode;
};
