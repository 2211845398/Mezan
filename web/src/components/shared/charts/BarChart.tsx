import { useMemo } from 'react';
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompactNumber } from '@/lib/format';

import { chartColor } from './chartTokens';
import type { ChartRow } from './LineChart';
import { mirrorCategoriesForRtl } from './mirrorCategoriesForRtl';
import { useChartRtl } from './useChartRtl';

export function BarChart({
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
      <RBarChart data={ordered} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={rtl ? 35 : -25}
          textAnchor={rtl ? 'start' : 'end'}
          height={48}
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
          contentStyle={{ borderRadius: 8 }}
        />
        <Bar dataKey={yKey} fill={chartColor(0)} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </RBarChart>
    </ResponsiveContainer>
  );
}
