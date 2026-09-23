import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MotionConfig } from 'framer-motion';
import {
  LayoutDashboard,
  Plus,
  Repeat,
  Receipt,
  Tags,
  Settings as SettingsIcon,
} from 'lucide-react';
import { isWeb } from '@shared/platform';
import { Button } from './components/ui/button';
import { useAppData } from './hooks/useAppData';
import { useApplyAppearance, useApplyTheme } from './hooks/useTheme';
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
} from './components/ui/sidebar';
import { BottomNav } from './components/ui/bottom-nav';
import { Skeleton } from './components/ui/skeleton';
import { CommandPalette } from './components/command-palette';
import { ErrorBoundary } from './components/error-boundary';
import { AiChatPanel } from './features/ai/AiChatPanel';
import { AiButton } from './features/ai/AiButton';
import { shortcut } from './lib/keys';
import { SubscriptionsView } from './features/subscriptions/SubscriptionsView';
import { PurchasesView } from './features/purchases/PurchasesView';
import { CategoriesView } from './features/categories/CategoriesView';
import { DashboardView } from './features/dashboard/DashboardView';
import { SettingsView } from './features/settings/SettingsView';

type View = 'dashboard' | 'subscriptions' | 'purchases' | 'categories' | 'settings';

const navItems: Array<{ id: View; label: string; shortLabel?: string; icon: JSX.Element }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { id: 'subscriptions', label: 'Subscriptions', shortLabel: 'Subs', icon: <Repeat /> },
  { id: 'purchases', label: 'Purchases', icon: <Receipt /> },
  { id: 'categories', label: 'Categories', icon: <Tags /> },
];

const settingsItem = { id: 'settings' as const, label: 'Settings', icon: <SettingsIcon /> };

export const App = (): JSX.Element => {
  const {
    data,
    dataDir,
    loading,
    loadError,
    refresh,
    rates,
    refreshRates,
    chooseDataDir,
    addSubscription,
    updateSubscription,
    toggleSubscriptionStatus,
    deactivateSubscriptions,
    deleteSubscription,
    deleteSubscriptions,
    setRenewalEnabled,
    addPurchase,
    updatePurchase,
    deletePurchase,
    deletePurchases,
    setItemsCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    updatePreferences,
    exportJson,
    exportSubscriptionsCsv,
    exportPurchasesCsv,
    exportIcs,
    importJson,
    importSubscriptionsCsv,
    importPurchasesCsv,
    checkRemindersNow,
    addSubscriptionByName,
    addPurchaseByName,
    updateSubscriptionPatch,
    updatePurchasePatch,
    backfillLogos,
    resetAllData,
  } = useAppData();

  const [view, setView] = useState<View>('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  // Bumped after a full data reset so the AI chat panel clears its transcript.
  const [chatResetSignal, setChatResetSignal] = useState(0);
  // One-shot: set true to make the Subscriptions view open its add dialog on
  // arrival (used by the dashboard first-run CTA). Avoids a mount-timing race.
  const [autoAddSub, setAutoAddSub] = useState(false);
  useApplyTheme(data?.preferences?.theme ?? 'system');
  useApplyAppearance(data?.preferences?.layoutTheme ?? 'default', data?.preferences?.brandColor);

  const defaultCurrency = data?.preferences?.defaultCurrency ?? 'USD';

  const navigate = (v: View): void => setView(v);

  const viewLabel =
    view === 'settings'
      ? 'Settings'
      : (navItems.find((n) => n.id === view)?.label ?? 'Tools & Subs');

  // Mobile "+" button — add contextually. On views that own an add flow
  // (subscriptions/purchases/categories) the mounted view handles `app:add`;
  // elsewhere, route to subscriptions and auto-open its add dialog.
  const handleAdd = (): void => {
    if (view === 'subscriptions' || view === 'purchases' || view === 'categories') {
      window.dispatchEvent(new CustomEvent('app:add'));
    } else {
      setAutoAddSub(true);
      setView('subscriptions');
    }
  };

  // Surface async failures that nothing else caught. Save failures are
  // already toasted by persist() and marked `reported`.
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent): void => {
      const reason = e.reason as { reported?: boolean; message?: string } | undefined;
      if (reason?.reported) return;
      toast.error('Something went wrong', {
        description: reason?.message || String(e.reason),
      });
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  // Global shortcuts: Cmd/Ctrl+N → add for current view; `/` → focus search.
  // The active view listens for these window events (only one is mounted).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || Boolean(el?.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:add'));
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:focus-search'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar>
          <SidebarHeader>
            <p className="truncate text-base font-semibold tracking-tight">Tools & Subs</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={dataDir}>
              {dataDir || '…'}
            </p>
          </SidebarHeader>
          <SidebarNav>
            {navItems.map((item) => (
              <SidebarItem
                key={item.id}
                active={view === item.id}
                onClick={() => navigate(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </SidebarItem>
            ))}
          </SidebarNav>
          <SidebarFooter>
            <SidebarItem active={view === 'settings'} onClick={() => navigate('settings')}>
              <SettingsIcon />
              <span>Settings</span>
            </SidebarItem>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="mt-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Quick switch</span>
              <kbd className="rounded-sm border bg-background px-1.5 py-0.5 font-mono text-xs">
                {shortcut('K')}
              </kbd>
            </button>
          </SidebarFooter>
        </Sidebar>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          data={data}
          onNavigate={setView}
        />

        <AiChatPanel
          open={aiOpen}
          onOpenChange={setAiOpen}
          data={data}
          rates={rates}
          preferences={data?.preferences}
          actions={{
            addSubscriptionByName: async (input, categoryName) => {
              const sub = await addSubscriptionByName(input, categoryName);
              return { id: sub.id, name: sub.name };
            },
            addPurchaseByName: async (input, categoryName) => {
              const p = await addPurchaseByName(input, categoryName);
              return { id: p.id, name: p.name };
            },
            addCategory,
            updateSubscriptionPatch: async (id, patch) => {
              const sub = await updateSubscriptionPatch(id, patch);
              return { name: sub.name };
            },
            updatePurchasePatch: async (id, patch) => {
              const p = await updatePurchasePatch(id, patch);
              return { name: p.name };
            },
            deleteSubscription,
            deletePurchase,
          }}
          resetSignal={chatResetSignal}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
            <div className="mx-auto max-w-6xl px-4 pb-36 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8">
              {/* The page's one h1, plus the assistant entry point. */}
              <header className="mb-4 flex min-h-11 items-center justify-between gap-3 sm:mb-6">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{viewLabel}</h1>
                <AiButton
                  enabled={Boolean(
                    data?.preferences.aiAssistant.enabled && data?.preferences.aiAssistant.hasKey,
                  )}
                  onClick={() => setAiOpen(true)}
                />
              </header>
              <ErrorBoundary key={view}>
                {loadError && !loading && !data ? (
                  <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
                    <h2 className="text-lg font-semibold">Couldn’t load your data</h2>
                    <p className="text-sm text-muted-foreground">
                      {isWeb()
                        ? 'We couldn’t reach the server. Check your connection and try again.'
                        : 'The data file couldn’t be read. Check that the data folder is available (Settings → Data location), then try again.'}
                    </p>
                    <p className="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {loadError}
                    </p>
                    <Button onClick={() => void refresh()}>Retry</Button>
                  </div>
                ) : loading || !data ? (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Skeleton className="h-28" />
                      <Skeleton className="h-28" />
                      <Skeleton className="h-28" />
                      <Skeleton className="h-28" />
                    </div>
                    <Skeleton className="h-48" />
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Skeleton className="h-64" />
                      <Skeleton className="h-64" />
                    </div>
                  </div>
                ) : view === 'settings' ? (
                  <SettingsView
                    dataDir={dataDir}
                    preferences={data.preferences}
                    onChooseDataDir={chooseDataDir}
                    onUpdatePreferences={updatePreferences}
                    onExportJson={exportJson}
                    onExportSubscriptionsCsv={exportSubscriptionsCsv}
                    onExportPurchasesCsv={exportPurchasesCsv}
                    onExportIcs={exportIcs}
                    onImportJson={importJson}
                    onImportSubscriptionsCsv={importSubscriptionsCsv}
                    onImportPurchasesCsv={importPurchasesCsv}
                    onCheckRemindersNow={checkRemindersNow}
                    rates={rates}
                    onRefreshRates={refreshRates}
                    missingLogoCount={
                      data
                        ? data.subscriptions.filter((s) => s.website && !s.logoUrl).length +
                          data.oneTimePurchases.filter((p) => p.website && !p.logoUrl).length
                        : 0
                    }
                    onBackfillLogos={backfillLogos}
                    onResetAllData={async () => {
                      await resetAllData();
                      setChatResetSignal((n) => n + 1);
                    }}
                  />
                ) : view === 'dashboard' ? (
                  <DashboardView
                    data={data}
                    rates={rates}
                    onGetStarted={() => {
                      setAutoAddSub(true);
                      setView('subscriptions');
                    }}
                    onToggleSubscription={(id) => void toggleSubscriptionStatus(id)}
                  />
                ) : view === 'subscriptions' ? (
                  <SubscriptionsView
                    subscriptions={data.subscriptions}
                    categories={data.categories}
                    defaultCurrency={defaultCurrency}
                    rates={rates}
                    autoOpenAdd={autoAddSub}
                    onAutoOpenConsumed={() => setAutoAddSub(false)}
                    onAdd={addSubscription}
                    onUpdate={updateSubscription}
                    onToggle={toggleSubscriptionStatus}
                    onDeactivate={deactivateSubscriptions}
                    onDelete={deleteSubscriptions}
                    onSetCategory={(ids, categoryId) =>
                      setItemsCategory('subscriptions', ids, categoryId)
                    }
                    onSetRenewalEnabled={setRenewalEnabled}
                  />
                ) : view === 'purchases' ? (
                  <PurchasesView
                    purchases={data.oneTimePurchases}
                    categories={data.categories}
                    defaultCurrency={defaultCurrency}
                    rates={rates}
                    onAdd={addPurchase}
                    onUpdate={updatePurchase}
                    onDelete={deletePurchases}
                    onSetCategory={(ids, categoryId) =>
                      setItemsCategory('purchases', ids, categoryId)
                    }
                  />
                ) : view === 'categories' ? (
                  <CategoriesView
                    data={data}
                    onAdd={addCategory}
                    onUpdate={updateCategory}
                    onDelete={deleteCategory}
                  />
                ) : null}
              </ErrorBoundary>
            </div>
          </div>
        </main>

        {view !== 'settings' && (
          <button
            type="button"
            aria-label="Add"
            onClick={handleAdd}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden [&_svg]:size-6"
          >
            <Plus />
          </button>
        )}

        <BottomNav items={[...navItems, settingsItem]} active={view} onNavigate={navigate} />
      </div>
    </MotionConfig>
  );
};
