import { cn } from '@/lib/utils';

/** Read-only detail fields: always-visible gray box, copyable text, no edit focus ring. */
export const readOnlyFieldClassName =
  'border border-input bg-muted/50 text-muted-foreground text-start opacity-100 shadow-none cursor-text select-text focus:outline-none focus-visible:outline-none focus:border-input focus-visible:border-input focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-text disabled:opacity-100 [&_svg]:hidden';

/** Merge read-only styling when the form is not in edit mode. */
export function readOnlyFieldClass(isEditing: boolean, className?: string): string {
  return cn(!isEditing && readOnlyFieldClassName, className);
}

/** Props helper: disabled when not editing (for selects, comboboxes, etc.). */
export function fieldDisabledWhenReadOnly(isEditing: boolean, extraDisabled = false): boolean {
  return !isEditing || extraDisabled;
}

export type ReadOnlyTextInputProps = {
  readOnly: boolean;
  disabled: boolean;
  tabIndex: number;
  className: string;
};

/** Native text inputs: use readOnly (not disabled) in view mode for natural text color. */
export function readOnlyTextInputProps(
  isEditing: boolean,
  className?: string,
): ReadOnlyTextInputProps {
  return {
    readOnly: !isEditing,
    disabled: false,
    tabIndex: 0,
    className: readOnlyFieldClass(isEditing, cn('text-start', className)),
  };
}

export type ReadOnlySelectProps = {
  disabled: boolean;
  className: string;
};

/** Radix Select triggers: remain disabled when not editing; styled for read-only display. */
export function readOnlySelectProps(isEditing: boolean, className?: string): ReadOnlySelectProps {
  return {
    disabled: !isEditing,
    className: readOnlyFieldClass(isEditing, cn('text-start', className)),
  };
}
