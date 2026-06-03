import { describe, expect, it } from 'vitest';

import { canAccessPath } from './canAccessPath';

describe('canAccessPath', () => {
  const cashierPerms = new Set([
    'pos_shifts:read',
    'pos_carts:update',
    'notifications:read',
  ]);

  it('allows dashboard and profile without explicit permissions', () => {
    expect(canAccessPath('/dashboard', cashierPerms)).toBe(true);
    expect(canAccessPath('/profile', cashierPerms)).toBe(true);
  });

  it('denies catalog when catalog:read is missing', () => {
    expect(canAccessPath('/catalog/products', cashierPerms)).toBe(false);
  });

  it('allows pos register when pos_carts:update is present', () => {
    expect(canAccessPath('/pos/register', cashierPerms)).toBe(true);
  });
});
