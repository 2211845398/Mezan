import { Cell, Pie, PieChart as RPieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { formatCompactNumber } from '@/lib/format';

import { CHART_COLORS } from './chartTokens';

import type { ChartRow } from './LineChart';

export function PieChart({
  data,
  nameKey,
  valueKey,
  height = 280,
}: {
  data: ChartRow[];
  nameKey: string;
  valueKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RPieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          innerRadius={56}
          outerRadius={88}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={String(i)} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => {
            const n = typeof value === 'number' ? value : Number(value);
            return formatCompactNumber(Number.isFinite(n) ? n : 0);
          }}
          contentStyle={{ borderRadius: 8 }}
        />
      </RPieChart>
    </ResponsiveContainer>
  );
}
