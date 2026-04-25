import { useMemo } from 'react';
import {
  Area,
  AreaChart as RAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompactNumber } from '@/lib/format';

import { mirrorCategoriesForRtl } from './mirrorCategoriesForRtl';
import { chartColor } from './chartTokens';
import { useChartRtl } from './useChartRtl';

import type { ChartRow } from './LineChart';

export function AreaChart({
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
  const fill = chartColor(0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={ordered} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fill} stopOpacity={0.35} />
            <stop offset="95%" stopColor={fill} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} reversed={rtl} />
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
        <Area type="monotone" dataKey={yKey} stroke={fill} fill="url(#areaFill)" strokeWidth={2} />
      </RAreaChart>
    </ResponsiveContainer>
  );
}
