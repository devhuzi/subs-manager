import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AppData, FxRates } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { formatCurrency } from '@renderer/lib/money';
import { categoryMonthlySplit } from './spendMetrics';
import { cn } from '@renderer/lib/utils';
import { CHART_COLORS, chartTooltipStyle } from './chartTheme';

interface Props {
  data: AppData;
  rates: FxRates | null;
  displayCurrency: string;
}

export const CategorySplit = ({ data, rates, displayCurrency }: Props): JSX.Element => {
  const reduceMotion = useReducedMotion();
  // A category's own color when it has one (it matches its badge everywhere
  // else); otherwise the next color from the categorical chart palette.
  const colorAt = (color: string | undefined, i: number): string =>
    color ?? CHART_COLORS[i % CHART_COLORS.length];
  const slices = useMemo(
    () => categoryMonthlySplit(data, displayCurrency, rates),
    [data, rates, displayCurrency],
  );
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const fmt = (n: number): string => formatCurrency(n, displayCurrency);
  const budgetById = useMemo(
    () => Object.fromEntries(data.categories.map((c) => [c.id, c.monthlyBudget])),
    [data.categories],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where your money goes</CardTitle>
        <CardDescription>
          Monthly equivalent by category. One-time purchases amortized over their expected lifespan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            Nothing to chart yet.
          </div>
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_1fr]">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="amount"
                    nameKey="categoryName"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                    isAnimationActive={!reduceMotion}
                  >
                    {slices.map((s, i) => (
                      <Cell key={s.categoryId ?? '__none__'} fill={colorAt(s.color, i)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value) => (typeof value === 'number' ? fmt(value) : String(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2.5 text-sm">
              {slices.map((s, i) => {
                const pct = total > 0 ? (s.amount / total) * 100 : 0;
                const budget = s.categoryId ? budgetById[s.categoryId] : undefined;
                const ratio = budget && budget > 0 ? s.amount / budget : null;
                const over = ratio != null && ratio > 1;
                const near = ratio != null && ratio >= 0.8 && ratio <= 1;
                return (
                  <li key={s.categoryId ?? '__none__'} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: colorAt(s.color, i) }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{s.categoryName}</span>
                      <span className="tabular-nums text-muted-foreground">{pct.toFixed(0)}%</span>
                      <span className="text-right tabular-nums font-medium">{fmt(s.amount)}</span>
                    </div>
                    {ratio != null && (
                      <div className="mt-1 flex items-center gap-2 pl-5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              over
                                ? 'bg-destructive'
                                : near
                                  ? 'bg-warning'
                                  : 'bg-muted-foreground/50',
                            )}
                            style={{ width: `${Math.min(100, ratio * 100)}%` }}
                          />
                        </div>
                        {/* State is spelled out (and iconed) so it survives color blindness. */}
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 text-xs tabular-nums',
                            over
                              ? 'text-destructive-ink'
                              : near
                                ? 'text-warning-ink'
                                : 'text-muted-foreground',
                          )}
                        >
                          {(over || near) && <AlertCircle className="size-3" aria-hidden />}
                          {over
                            ? `Over by ${fmt(s.amount - budget!)}`
                            : near
                              ? `Near budget of ${fmt(budget!)}`
                              : `of ${fmt(budget!)}`}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
