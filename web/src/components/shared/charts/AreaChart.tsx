import { useMemo } from 'react';
import {
  Area,
  AreaChart as RAreaChart,
  CartesianGrid,
  Label,
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

export function AreaChart({
  data,
  xKey,
  yKey,
  height = 280,
  yTickFormatter = (v: number) => formatCompactNumber(v),
  xAxisLabel,
  yAxisLabel,
}: {
  data: ChartRow[];
  xKey: string;
  yKey: string;
  height?: number;
  yTickFormatter?: (v: number) => string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}) {
  const rtl = useChartRtl();
  const ordered = useMemo(() => mirrorCategoriesForRtl(data, rtl), [data, rtl]);
  const fill = chartColor(0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart
        data={ordered}
        margin={{ top: 16, right: rtl ? 32 : 24, left: rtl ? 24 : 32, bottom: xAxisLabel ? 34 : 16 }}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fill} stopOpacity={0.35} />
            <stop offset="95%" stopColor={fill} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          reversed={rtl}
        >
          {xAxisLabel ? (
            <Label
              value={xAxisLabel}
              position="insideBottom"
              offset={-22}
              className="fill-muted-foreground text-[11px]"
            />
          ) : null}
        </XAxis>
        <YAxis
          width={76}
          orientation={rtl ? 'right' : 'left'}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tickFormatter={(v) => yTickFormatter(Number(v))}
        >
          {yAxisLabel ? (
            <Label
              value={yAxisLabel}
              angle={rtl ? 90 : -90}
              position={rtl ? 'insideRight' : 'insideLeft'}
              offset={0}
              className="fill-muted-foreground text-[11px]"
            />
          ) : null}
        </YAxis>
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
