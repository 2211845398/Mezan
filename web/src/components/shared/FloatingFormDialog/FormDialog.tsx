import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from './styles';
import type { FloatingFormActionsProps, FloatingFormDialogProps } from './types';

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

/**
 * Centered floating form dialog matching the UI screenshot style.
 * - Centered white surface with rounded corners
 * - Dark overlay
 * - RTL-first text alignment
 * - Vertical field rhythm
 * - Primary action: green approve (`floatingFormApproveButtonClassName`)
 * - Cancel/Close: outlined green label (`floatingFormCloseButtonClassName`)
 *
 * Use with the shared Form component and form primitives for consistent UX.
 */
export function FloatingFormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: FloatingFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        motionless
        className={cn(
          'flex max-h-[min(90dvh,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:rounded-lg',
          maxWidthClasses[maxWidth],
        )}
      >
        <DialogHeader className="shrink-0 space-y-2 px-6 pt-6">
          <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-4 [scrollbar-gutter:stable]">
          {children}
        </div>
        {footer ? (
          <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-between">{footer}</DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Standard footer actions for floating form dialogs.
 * Primary action is dark (default variant), cancel is outline.
 * RTL-safe button order via flex row-reverse on small screens (which respects dir).
 */
export function FloatingFormActions({
  submitLabel,
  cancelLabel,
  onCancel,
  isSubmitting = false,
  submitDisabled = false,
}: FloatingFormActionsProps) {
  return (
    <>
      <Button type="submit" disabled={isSubmitting || submitDisabled} className={floatingFormApproveButtonClassName}>
        {submitLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isSubmitting}
        className={floatingFormCloseButtonClassName}
      >
        {cancelLabel}
      </Button>
    </>
  );
}
