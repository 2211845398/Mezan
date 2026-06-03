import {
  Cell,
  Legend,
  type LegendPayload,
  Pie,
  PieChart as RPieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { formatCompactNumber } from '@/lib/format';

import { CHART_COLORS } from './chartTokens';
import type { ChartRow } from './LineChart';

/** Props injected when `<Legend content={<CategoryLegend />} />` is cloned by Recharts. */
type CategoryLegendProps = {
  payload?: ReadonlyArray<LegendPayload> | null;
};

function CategoryLegend({ payload }: CategoryLegendProps) {
  if (!payload?.length) return null;
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      {payload.map((entry, index) => (
        <li
          key={`${String(entry.dataKey ?? '')}-${String(entry.value)}-${index}`}
          className="flex min-w-0 items-start gap-2 text-xs leading-snug text-muted-foreground"
        >
          <span
            className="mt-0.5 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color ?? 'transparent' }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 break-words" title={entry.value ?? ''}>
            {entry.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

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
      <RPieChart margin={{ top: 8, right: 8, bottom: 16, left: 8 }}>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="42%"
          innerRadius={52}
          outerRadius={82}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={String(i)} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => {
            const n = typeof value === 'number' ? value : Number(value);
            return [formatCompactNumber(Number.isFinite(n) ? n : 0), name];
          }}
          contentStyle={{ borderRadius: 8 }}
        />
        <Legend verticalAlign="bottom" align="center" content={<CategoryLegend />} wrapperStyle={{ width: '100%', paddingTop: 12 }} />
      </RPieChart>
    </ResponsiveContainer>
  );
}
