import { useMemo } from 'react';
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Legend,
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

export function StackedBarChart({
  data,
  xKey,
  stackKeys,
  height = 280,
}: {
  data: ChartRow[];
  xKey: string;
  stackKeys: string[];
  height?: number;
}) {
  const rtl = useChartRtl();
  const ordered = useMemo(() => mirrorCategoriesForRtl(data, rtl), [data, rtl]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={ordered} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} reversed={rtl} />
        <YAxis
          width={48}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCompactNumber(Number(v))}
        />
        <Tooltip
          formatter={(value) => {
            const n = typeof value === 'number' ? value : Number(value);
            return formatCompactNumber(Number.isFinite(n) ? n : 0);
          }}
          contentStyle={{ borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {stackKeys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="a" fill={chartColor(i)} maxBarSize={40} />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}
