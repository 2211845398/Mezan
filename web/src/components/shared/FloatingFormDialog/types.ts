import type { ReactNode } from 'react';

export type FloatingFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
};

export type FloatingFormActionsProps = {
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
};
