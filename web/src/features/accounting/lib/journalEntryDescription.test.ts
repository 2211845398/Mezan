import { describe, expect, it } from 'vitest';

import { formatJournalEntryDescription } from './journalEntryDescription';

const t = ((key: string, opts?: Record<string, string>) => {
  const map: Record<string, string> = {
    'journal.desc.goods_receipt': `استلام بضاعة ${opts?.id}`,
    'journal.desc.transfer_batch_received': `استلام دفعة تحويل ${opts?.id}`,
    'journal.desc.reversal': `عكس قيد #${opts?.id}`,
  };
  return map[key] ?? key;
}) as never;

describe('formatJournalEntryDescription', () => {
  it('localizes system goods receipt in Arabic', () => {
    expect(
      formatJournalEntryDescription(
        { description: 'Goods receipt 4', source_type: 'goods_receipt', source_id: '4' },
        t,
        'ar',
      ),
    ).toBe('استلام بضاعة 4');
  });

  it('keeps manual user text unchanged in Arabic', () => {
    expect(
      formatJournalEntryDescription(
        { description: 'ليبيا', source_type: 'manual', source_id: '' },
        t,
        'ar',
      ),
    ).toBe('ليبيا');
  });

  it('localizes reversal prefix but keeps user reason in parentheses', () => {
    expect(
      formatJournalEntryDescription(
        {
          description: 'Reversal of JE #14 (كساد)',
          source_type: 'journal_reversal',
          source_id: '14',
        },
        t,
        'ar',
      ),
    ).toBe('عكس قيد #14 (كساد)');
  });

  it('returns English description when locale is en', () => {
    expect(
      formatJournalEntryDescription(
        { description: 'Goods receipt 4', source_type: 'goods_receipt', source_id: '4' },
        t,
        'en',
      ),
    ).toBe('Goods receipt 4');
  });
});
