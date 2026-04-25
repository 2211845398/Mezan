import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompactNumber } from '@/lib/format';

import { mirrorCategoriesForRtl } from './mirrorCategoriesForRtl';
import { chartColor } from './chartTokens';
import { useChartRtl } from './useChartRtl';

export type ChartRow = Record<string, string | number | null | undefined>;

export function LineChart({
  data,
  xKey,
  yKey,
  height = 280,
  yTickFormatter = (v: number) => formatCompactNumber(v),
}: {
  data: ChartRow[];
  xKey: string;
  yKey: string;
  height?: number;
  yTickFormatter?: (v: number) => string;
}) {
  const rtl = useChartRtl();
  const ordered = useMemo(() => mirrorCategoriesForRtl(data, rtl), [data, rtl]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={ordered} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          reversed={rtl}
        />
        <YAxis
          width={48}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => yTickFormatter(Number(v))}
        />
        <Tooltip
          formatter={(value) => {
            const n = typeof value === 'number' ? value : Number(value);
            return yTickFormatter(Number.isFinite(n) ? n : 0);
          }}
          labelFormatter={(l) => String(l)}
          contentStyle={{ borderRadius: 8 }}
        />
        <Line type="monotone" dataKey={yKey} stroke={chartColor(0)} strokeWidth={2} dot={false} />
      </RLineChart>
    </ResponsiveContainer>
  );
}
