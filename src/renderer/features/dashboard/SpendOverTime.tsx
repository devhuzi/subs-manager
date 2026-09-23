import { useId, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppData, FxRates } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { formatCurrency } from '@renderer/lib/money';
import { historicalSpendByMonth } from './spendMetrics';
import { chartTooltipStyle } from './chartTheme';

interface Props {
  data: AppData;
  rates: FxRates | null;
  displayCurrency: string;
}

export const SpendOverTime = ({ data, rates, displayCurrency }: Props): JSX.Element => {
  const gradientId = useId();
  const reduceMotion = useReducedMotion();
  const points = useMemo(
    () => historicalSpendByMonth(data, displayCurrency, rates, 12),
    [data, rates, displayCurrency],
  );
  const fmt = (n: number): string => formatCurrency(n, displayCurrency);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spend over time</CardTitle>
        <CardDescription>Last 12 months. Renewals + one-time purchases combined.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => fmt(v)}
                width={84}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value) => (typeof value === 'number' ? fmt(value) : String(value))}
                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="total"
                name="Spent"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={!reduceMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
