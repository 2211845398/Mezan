import { describe, expect, it } from 'vitest';

import { accountTypeLabel } from './accountTypeLabel';

const t = ((key: string) => {
  const map: Record<string, string> = {
    'coa.account_type.asset': 'أصل',
    'coa.account_type.revenue': 'إيراد',
  };
  return map[key] ?? key;
}) as never;

describe('accountTypeLabel', () => {
  it('returns Arabic label for known types', () => {
    expect(accountTypeLabel(t, 'asset')).toBe('أصل');
    expect(accountTypeLabel(t, 'revenue')).toBe('إيراد');
  });

  it('passes through unknown types', () => {
    expect(accountTypeLabel(t, 'custom')).toBe('custom');
  });
});
