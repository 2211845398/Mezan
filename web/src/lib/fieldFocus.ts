/**
 * Mizan field border states — apply only on the native control
 * (`<input>`, `<textarea>`, `SelectTrigger`, outline combobox `Button`).
 * Never on wrappers (`FormItem`, layout divs).
 *
 * Resting: subtle gray · Focus: brand forest green (--ring) · Invalid: destructive.
 */
export const MEZ_FIELD_BORDER_CLASS = [
  'border border-input transition-colors',
  'focus:outline-none focus-visible:outline-none',
  'focus:border-ring focus-visible:border-ring',
  'focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
  'aria-invalid:border-destructive',
  'aria-invalid:focus:border-destructive aria-invalid:focus-visible:border-destructive',
].join(' ');

/** Outline combobox trigger — suppresses default Button focus ring. */
export const MEZ_COMBOBOX_BORDER_CLASS = [
  'border-input transition-colors',
  'focus:border-ring focus-visible:border-ring',
  'focus:outline-none focus-visible:outline-none',
  'focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
  'aria-invalid:border-destructive',
  'aria-invalid:focus:border-destructive aria-invalid:focus-visible:border-destructive',
].join(' ');

/** @deprecated Use MEZ_FIELD_BORDER_CLASS on the control element only. */
export const MEZ_FIELD_FOCUS_CLASS = MEZ_FIELD_BORDER_CLASS;

/** @deprecated Use MEZ_COMBOBOX_BORDER_CLASS on the trigger button only. */
export const MEZ_COMBOBOX_FOCUS_CLASS = MEZ_COMBOBOX_BORDER_CLASS;

/** Native `<input>` on auth pages (same border chrome as `<Input />`). */
export const MEZ_AUTH_INPUT_CLASS = [
  'flex h-10 w-full rounded-md bg-input-background px-3 py-2 text-sm shadow-sm',
  'placeholder:text-muted-foreground',
  'disabled:cursor-not-allowed disabled:opacity-50',
  MEZ_FIELD_BORDER_CLASS,
].join(' ');
