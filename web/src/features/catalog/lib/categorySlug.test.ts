import { describe, expect, it } from 'vitest';

import { generateCategorySlug, isRandomCategorySlug } from './categorySlug';

describe('generateCategorySlug', () => {
  it('slugifies English names', () => {
    expect(generateCategorySlug('Beverages')).toBe('beverages');
    expect(generateCategorySlug('Red Shoes')).toBe('red-shoes');
  });

  it('uses random slug for Arabic names', () => {
    const slug = generateCategorySlug('مشروبات');
    expect(isRandomCategorySlug(slug)).toBe(true);
  });

  it('uses random slug for mixed Arabic/Latin names', () => {
    const slug = generateCategorySlug('Drinks مشروبات');
    expect(isRandomCategorySlug(slug)).toBe(true);
  });

  it('falls back to random slug when Latin name has no slug chars', () => {
    const slug = generateCategorySlug('!!!');
    expect(isRandomCategorySlug(slug)).toBe(true);
  });
});
