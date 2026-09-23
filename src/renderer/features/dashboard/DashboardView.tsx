import { Plus } from 'lucide-react';
import type { AppData, FxRates } from '../../../shared/types';
import { Button } from '@renderer/components/ui/button';
import { shortcut } from '@renderer/lib/keys';
import { HeroCard } from './HeroCard';
import { UpcomingRenewalsWidget } from './UpcomingRenewalsWidget';
import { ReviewCard } from './ReviewCard';
import { SpendOverTime } from './SpendOverTime';
import { CategorySplit } from './CategorySplit';
import { TopExpenses } from './TopExpenses';
import { ForecastCard } from './ForecastCard';
import { TrialsExpiringSoon } from './TrialsExpiringSoon';
import { CancellationSavings } from './CancellationSavings';
import { currentMonthProjection, runrateComparison } from './spendMetrics';

interface Props {
  data: AppData;
  rates: FxRates | null;
  onGetStarted: () => void;
  /** Flips a subscription active/inactive (the Review card's Deactivate). */
  onToggleSubscription: (id: string) => void;
}

/**
 * Answers three questions, in order: what do I pay (hero), what renews next
 * (upcoming renewals), and what could I cancel (review). Detail charts follow.
 */
export const DashboardView = ({
  data,
  rates,
  onGetStarted,
  onToggleSubscription,
}: Props): JSX.Element => {
  const isEmpty = data.subscriptions.length === 0 && data.oneTimePurchases.length === 0;
  if (isEmpty) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h2 className="text-xl font-semibold tracking-tight">Track your first subscription</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Add the tools and subscriptions you pay for to see your monthly cost, upcoming renewals,
          and where your money goes.
        </p>
        <Button className="mt-5" onClick={onGetStarted}>
          <Plus />
          Add your first subscription
        </Button>
        <p className="mt-3 hidden text-xs text-muted-foreground lg:block">
          Tip: press{' '}
          <kbd className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono">{shortcut('N')}</kbd>{' '}
          anywhere to add.
        </p>
      </div>
    );
  }
  const displayCurrency = data.preferences.defaultCurrency;
  const activeCount = data.subscriptions.filter((s) => s.status === 'active').length;
  const monthly = currentMonthProjection(data, displayCurrency, rates);
  // Like-for-like: today's runrate vs last month's; undefined when there's no
  // prior runrate, so the hero never shows a fabricated "+100%".
  const { deltaPct } = runrateComparison(data, displayCurrency, rates);

  return (
    <div className="space-y-6">
      <HeroCard
        monthly={monthly.total}
        currency={displayCurrency}
        unconverted={monthly.unconverted}
        trend={deltaPct}
        activeCount={activeCount}
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <UpcomingRenewalsWidget
          subscriptions={data.subscriptions}
          categories={data.categories}
          displayCurrency={displayCurrency}
          rates={rates}
        />
        <ReviewCard
          subscriptions={data.subscriptions}
          displayCurrency={displayCurrency}
          rates={rates}
          onDeactivate={onToggleSubscription}
        />
      </div>

      <TrialsExpiringSoon
        subscriptions={data.subscriptions}
        displayCurrency={displayCurrency}
        rates={rates}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SpendOverTime data={data} rates={rates} displayCurrency={displayCurrency} />
        <CategorySplit data={data} rates={rates} displayCurrency={displayCurrency} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <TopExpenses
          subscriptions={data.subscriptions}
          rates={rates}
          displayCurrency={displayCurrency}
        />
        <div className="grid gap-6">
          <ForecastCard data={data} rates={rates} displayCurrency={displayCurrency} />
          <CancellationSavings data={data} rates={rates} displayCurrency={displayCurrency} />
        </div>
      </div>
    </div>
  );
};
