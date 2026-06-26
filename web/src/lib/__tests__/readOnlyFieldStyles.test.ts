import { describe, expect, it } from 'vitest';

import {
  readOnlyFieldClass,
  readOnlyFieldClassName,
  readOnlySelectProps,
  readOnlyTextInputProps,
} from '@/lib/readOnlyFieldStyles';

describe('readOnlyFieldStyles', () => {
  it('exports read-only class with visible gray box, logical alignment, and copy support', () => {
    expect(readOnlyFieldClassName).toContain('text-muted-foreground');
    expect(readOnlyFieldClassName).toContain('bg-muted/50');
    expect(readOnlyFieldClassName).toContain('border-input');
    expect(readOnlyFieldClassName).toContain('opacity-100');
    expect(readOnlyFieldClassName).toContain('text-start');
    expect(readOnlyFieldClassName).toContain('select-text');
    expect(readOnlyFieldClassName).toContain('cursor-text');
    expect(readOnlyFieldClassName).not.toContain('pointer-events-none');
    expect(readOnlyFieldClassName).not.toContain('border-transparent');
  });

  it('readOnlyFieldClass applies styling only when not editing', () => {
    expect(readOnlyFieldClass(true)).toBe('');
    expect(readOnlyFieldClass(false)).toContain('text-muted-foreground');
    expect(readOnlyFieldClass(false, 'h-9')).toContain('h-9');
  });

  it('readOnlyTextInputProps uses readOnly (not disabled) in view mode with keyboard focus', () => {
    const view = readOnlyTextInputProps(false);
    expect(view.readOnly).toBe(true);
    expect(view.disabled).toBe(false);
    expect(view.tabIndex).toBe(0);
    expect(view.className).toContain('text-muted-foreground');
    expect(view.className).toContain('bg-muted/50');
    expect(view.className).toContain('text-start');
    expect(view.className).toContain('select-text');

    const edit = readOnlyTextInputProps(true);
    expect(edit.readOnly).toBe(false);
    expect(edit.disabled).toBe(false);
    expect(edit.tabIndex).toBe(0);
    expect(edit.className).toBe('text-start');
  });

  it('readOnlySelectProps disables select in view mode with read-only styling', () => {
    const view = readOnlySelectProps(false);
    expect(view.disabled).toBe(true);
    expect(view.className).toContain('text-muted-foreground');
    expect(view.className).toContain('[&_svg]:hidden');

    const edit = readOnlySelectProps(true);
    expect(edit.disabled).toBe(false);
    expect(edit.className).toBe('text-start');
  });
});
