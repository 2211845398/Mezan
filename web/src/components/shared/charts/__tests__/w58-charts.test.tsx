import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { formatCompactNumber } from '@/lib/format';

import { KpiCard } from '../KpiCard';
import { mirrorCategoriesForRtl } from '../mirrorCategoriesForRtl';

describe('W-5.8 charts', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('KpiCard renders five metric cards from fixture', () => {
    const { container } = render(
      <div className="grid grid-cols-5 gap-2">
        <KpiCard title="Revenue" value="$1,200.00" dir="ltr" />
        <KpiCard title="Margin" value="32.5%" dir="ltr" />
        <KpiCard title="Orders" value="42" dir="ltr" />
        <KpiCard title="Avg ticket" value="$28.57" dir="ltr" />
        <KpiCard title="Loyalty" value="1.2K" dir="ltr" />
      </div>,
    );
    expect(container.querySelector('[dir="ltr"]')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$1,200.00')).toBeInTheDocument();
    expect(screen.getByText('Margin')).toBeInTheDocument();
    expect(screen.getByText('32.5%')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Avg ticket')).toBeInTheDocument();
    expect(screen.getByText('$28.57')).toBeInTheDocument();
    expect(screen.getByText('Loyalty')).toBeInTheDocument();
    expect(screen.getByText('1.2K')).toBeInTheDocument();
  });

  it('KpiCard uses rtl direction when locale is Arabic', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar');
    });
    const { container } = render(<KpiCard title="الإيراد" value="1,200" />);
    const card = container.querySelector('[dir="rtl"]');
    expect(card).toBeTruthy();
    expect(screen.getByText('الإيراد')).toHaveClass('text-muted-foreground');
  });

  it('mirrorCategoriesForRtl reverses rows when rtl is true', () => {
    const rows = [{ c: 'A' }, { c: 'B' }, { c: 'C' }];
    expect(mirrorCategoriesForRtl(rows, false).map((r) => r.c).join('')).toBe('ABC');
    expect(mirrorCategoriesForRtl(rows, true).map((r) => r.c).join('')).toBe('CBA');
  });

  it('formatCompactNumber uses ASCII digits for chart-style labels', () => {
    const s = formatCompactNumber(1234);
    expect(s).toMatch(/[0-9]/);
    expect(s).not.toMatch(/[٠-٩]/);
  });
});
