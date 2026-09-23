import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FxRates, Subscription } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { formatCurrency } from '@renderer/lib/money';
import { topMonthlyExpenses } from './spendMetrics';
import { chartTooltipStyle } from './chartTheme';

interface Props {
  subscriptions: Subscription[];
  rates: FxRates | null;
  displayCurrency: string;
}

export const TopExpenses = ({ subscriptions, rates, displayCurrency }: Props): JSX.Element => {
  const reduceMotion = useReducedMotion();
  const rows = useMemo(
    () => topMonthlyExpenses(subscriptions, displayCurrency, rates, 5),
    [subscriptions, rates, displayCurrency],
  );
  const fmt = (n: number): string => formatCurrency(n, displayCurrency);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top expenses</CardTitle>
        <CardDescription>Largest active subscriptions by monthly equivalent.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            No active subscriptions.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <XAxis type="number" hide tickFormatter={(v: number) => fmt(v)} />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  width={110}
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--accent))' }}
                  contentStyle={chartTooltipStyle}
                  formatter={(value) => (typeof value === 'number' ? fmt(value) : String(value))}
                />
                {/* One color: bar length carries the comparison, not hue. */}
                <Bar
                  dataKey="monthlyEquivalent"
                  name="Per month"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 4, 4]}
                  isAnimationActive={!reduceMotion}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
