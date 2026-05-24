import { describe, expect, it } from 'vitest';

import { suggestChildCodeClient } from './coaSuggestCode';

describe('suggestChildCodeClient', () => {
  it('appends 01 when parent has no children', () => {
    expect(suggestChildCodeClient('11', [])).toBe('1101');
  });

  it('increments numeric sibling suffix', () => {
    expect(suggestChildCodeClient('11', ['1101', '1102'])).toBe('1103');
  });
});
