import { describe, expect, it } from 'vitest';

import { resolveCoaDisplayName } from './coaDisplayName';

describe('resolveCoaDisplayName', () => {
  const row = { name: 'Legacy', name_ar: 'عربي', name_en: 'English' };

  it('prefers Arabic when locale is ar', () => {
    expect(resolveCoaDisplayName(row, 'ar')).toBe('عربي');
    expect(resolveCoaDisplayName(row, 'ar-SA')).toBe('عربي');
  });

  it('prefers English when locale is en', () => {
    expect(resolveCoaDisplayName(row, 'en')).toBe('English');
    expect(resolveCoaDisplayName(row, 'en-US')).toBe('English');
  });

  it('falls back to seed Arabic by code when name_ar is empty', () => {
    expect(
      resolveCoaDisplayName(
        { name: 'Trade Payables', name_ar: '', name_en: 'Trade Payables', code: '2010' },
        'ar',
      ),
    ).toBe('ذمم موردين');
  });

  it('falls back to legacy name when no Arabic label exists', () => {
    expect(resolveCoaDisplayName({ name: 'Legacy', name_ar: '', name_en: null }, 'ar')).toBe(
      'Legacy',
    );
  });
});
