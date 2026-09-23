import type { CSSProperties } from 'react';

/** The categorical palette (`--chart-1..6` in index.css), for series without their own color. */
export const CHART_COLORS = [1, 2, 3, 4, 5, 6].map((i) => `hsl(var(--chart-${i}))`);

/** Recharts tooltip box, drawn from the same tokens as popovers. */
export const chartTooltipStyle: CSSProperties = {
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  fontSize: 12,
};
