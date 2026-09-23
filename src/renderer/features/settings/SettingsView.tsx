import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BellRing,
  CalendarDays,
  Check,
  Download,
  FolderCog,
  FolderOpen,
  KeyRound,
  LogOut,
  MessageSquare,
  Palette,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { normalizeLayoutTheme } from '../../../shared/types';
import type {
  ActiveLayoutTheme,
  AiAssistantPrefs,
  FxRates,
  LayoutTheme,
  NotifyPrefs,
  Preferences,
  Theme,
  WebAuthApi,
  WebPushApi,
} from '../../../shared/types';
import type { PreferencesPatch } from '@renderer/hooks/useAppData';
import { isValidHex, normalizeHex } from '@renderer/lib/colors';
import { Button } from '@renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { IconTooltip } from '@renderer/components/ui/tooltip';
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog';
import { FieldError } from '@renderer/components/ui/field-error';
import { CurrencySelect } from '@renderer/components/currency-select';
import { cn } from '@renderer/lib/utils';
import { MODEL_OPTIONS, modelSupportsVision } from '../ai/models';
import { isWeb } from '@shared/platform';
import { LegalLinks } from '@renderer/components/legal-links';

interface Props {
  dataDir: string;
  preferences: Preferences;
  onChooseDataDir: () => Promise<void>;
  onUpdatePreferences: (patch: PreferencesPatch) => Promise<void>;
  onExportJson: () => Promise<void>;
  onExportSubscriptionsCsv: () => Promise<void>;
  onExportPurchasesCsv: () => Promise<void>;
  onExportIcs: () => Promise<void>;
  onImportJson: () => Promise<void>;
  onImportSubscriptionsCsv: () => Promise<void>;
  onImportPurchasesCsv: () => Promise<void>;
  onCheckRemindersNow: () => Promise<void>;
  rates: FxRates | null;
  onRefreshRates: () => Promise<void>;
  missingLogoCount: number;
  onBackfillLogos: () => Promise<{ found: number; fetched: number }>;
  onResetAllData: () => Promise<void>;
}

const DAYS_SUGGESTIONS = [30, 14, 7, 3, 1, 0];

export const SettingsView = ({
  dataDir,
  preferences,
  onChooseDataDir,
  onUpdatePreferences,
  onExportJson,
  onExportSubscriptionsCsv,
  onExportPurchasesCsv,
  onExportIcs,
  onImportJson,
  onImportSubscriptionsCsv,
  onImportPurchasesCsv,
  onCheckRemindersNow,
  rates,
  onRefreshRates,
  missingLogoCount,
  onBackfillLogos,
  onResetAllData,
}: Props): JSX.Element => {
  const [backfilling, setBackfilling] = useState(false);
  const runBackfill = async (): Promise<void> => {
    if (backfilling) return;
    setBackfilling(true);
    const t = toast.loading(`Fetching ${missingLogoCount} logos…`);
    try {
      const res = await onBackfillLogos();
      toast.success(`Fetched ${res.fetched} of ${res.found} logos`, { id: t });
    } catch (err) {
      toast.error('Logo backfill failed', { id: t, description: (err as Error).message });
    } finally {
      setBackfilling(false);
    }
  };
  const [reminderDays, setReminderDays] = useState(String(preferences.reminderDays));
  const [confirmRestore, setConfirmRestore] = useState(false);

  const commitReminderDays = (): void => {
    const n = Math.max(1, Math.min(365, Math.round(Number(reminderDays))));
    if (Number.isFinite(n) && n !== preferences.reminderDays) {
      void onUpdatePreferences({ reminderDays: n });
      setReminderDays(String(n));
    } else {
      setReminderDays(String(preferences.reminderDays));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>How the app looks and behaves.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2 md:max-w-xs">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={preferences.theme}
              onValueChange={(v) => void onUpdatePreferences({ theme: v as Theme })}
            >
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 md:max-w-xs">
            <Label htmlFor="defaultCurrency">Default currency</Label>
            <div className="flex items-center gap-2">
              <CurrencySelect
                id="defaultCurrency"
                value={preferences.defaultCurrency}
                onChange={(next) => void onUpdatePreferences({ defaultCurrency: next })}
              />
              <IconTooltip label="Refresh exchange rates">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void onRefreshRates()}
                  aria-label="Refresh exchange rates"
                >
                  <RefreshCw />
                </Button>
              </IconTooltip>
            </div>
            <p className="text-xs text-muted-foreground">
              Every total is converted into this currency at the live rate (from Frankfurter).
              Items keep the currency you entered; the converted value is shown beside it. Pre-fills
              the currency field on new items too.
              {rates &&
                ` Rates last fetched ${formatDistanceToNow(parseISO(rates.fetchedAt), { addSuffix: true })}.`}
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="logo-fetch" className="text-base">
                  Fetch service logos
                </Label>
                <p className="text-sm text-muted-foreground">
                  When adding a subscription with a website, ask DuckDuckGo / Google for its icon and
                  store it with your data. One outbound request per new subscription.
                </p>
              </div>
              <Switch
                id="logo-fetch"
                checked={preferences.enableLogoFetch}
                onCheckedChange={(v) => void onUpdatePreferences({ enableLogoFetch: v })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {missingLogoCount === 0
                  ? 'All items with a website have a logo.'
                  : `${missingLogoCount} item${missingLogoCount === 1 ? '' : 's'} with a website ` +
                    `${missingLogoCount === 1 ? "doesn't" : "don't"} have a logo yet.`}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runBackfill()}
                disabled={backfilling || missingLogoCount === 0 || !preferences.enableLogoFetch}
              >
                <RefreshCw />
                {backfilling ? 'Fetching…' : 'Backfill logos'}
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:max-w-xs">
            <Label htmlFor="reminderDays">Reminder lead time</Label>
            <div className="flex items-center gap-2">
              <Input
                id="reminderDays"
                type="number"
                min={1}
                max={365}
                value={reminderDays}
                onChange={(e) => setReminderDays(e.target.value)}
                onBlur={commitReminderDays}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Drives the Dashboard&apos;s upcoming list and the alarm lead time in the exported
              calendar (.ics) file.
            </p>
          </div>
        </CardContent>
      </Card>

      <AppearanceCard
        layoutTheme={preferences.layoutTheme}
        brandColor={preferences.brandColor}
        onPatch={(patch) => void onUpdatePreferences(patch)}
      />

      <NotificationsCard
        prefs={preferences.notify}
        onPatch={(patch) =>
          void onUpdatePreferences((prev) => ({ notify: { ...prev.notify, ...patch } }))
        }
        onCheckNow={onCheckRemindersNow}
      />

      {/* Data directory is a desktop-only concept — the web app stores data in Supabase. */}
      {!isWeb() && (
        <Card>
          <CardHeader>
            <CardTitle>Data location</CardTitle>
            <CardDescription>
              All your data lives in this folder. You can move it anywhere — pick the new folder and
              the app will use it on next save.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="break-all rounded-md border bg-muted px-3 py-2 text-sm">{dataDir}</p>
            <Button variant="outline" onClick={() => void onChooseDataDir()}>
              <FolderCog />
              Change data directory
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Backup & migration</CardTitle>
          <CardDescription>
            Export your data for safekeeping, or move it between machines. JSON is a full backup
            (recommended). CSV exports are friendly for spreadsheets. The .ics file imports into
            Google / Outlook / Apple Calendar with renewal reminders built in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Export</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void onExportJson()}>
                <Download />
                Full backup (JSON)
              </Button>
              <Button variant="outline" onClick={() => void onExportSubscriptionsCsv()}>
                <Download />
                Subscriptions (CSV)
              </Button>
              <Button variant="outline" onClick={() => void onExportPurchasesCsv()}>
                <Download />
                Purchases (CSV)
              </Button>
              <Button variant="outline" onClick={() => void onExportIcs()}>
                <CalendarDays />
                Calendar (.ics)
              </Button>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Import</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirmRestore(true)}>
                <Upload />
                Restore from JSON
              </Button>
              <Button variant="outline" onClick={() => void onImportSubscriptionsCsv()}>
                <Upload />
                Subscriptions from CSV
              </Button>
              <Button variant="outline" onClick={() => void onImportPurchasesCsv()}>
                <Upload />
                Purchases from CSV
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              JSON import replaces all data. CSV imports append rows. Categories are matched by
              name; new ones are created if needed.
            </p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title="Replace all data?"
        description={
          <p>
            Restoring replaces every subscription, purchase, category, and preference with the
            contents of the file you pick. Export a backup first if you want to keep what&apos;s
            here now.
          </p>
        }
        confirmLabel="Choose file and replace"
        destructive
        onConfirm={onImportJson}
      />

      <AiAssistantCard
        prefs={preferences.aiAssistant}
        onPatch={(patch) =>
          void onUpdatePreferences((prev) => ({
            aiAssistant: { ...prev.aiAssistant, ...patch },
          }))
        }
      />

      {/* Local rotating file backups are desktop-only; web backups come via Supabase. */}
      {!isWeb() && <BackupsCard />}

      {isWeb() && window.api.auth && <AccountCard auth={window.api.auth} />}

      <DangerZoneCard onReset={onResetAllData} />

      {isWeb() && <LegalLinks className="pb-2 text-center" />}
    </div>
  );
};

interface AppearanceCardProps {
  layoutTheme: LayoutTheme;
  brandColor?: string;
  onPatch: (patch: Partial<Preferences>) => void;
}

const LAYOUTS: Array<{ id: ActiveLayoutTheme; label: string; blurb: string }> = [
  { id: 'default', label: 'Default', blurb: 'Soft rounded cards and a floating tab bar.' },
  { id: 'sharp', label: 'Crisp', blurb: 'Tight corners, flat surfaces, flush tab bar.' },
];

// Green, amber and red are reserved for state (success / warning / overdue),
// so they aren't offered as accents.
const BRAND_PRESETS: Array<{ name: string; value: string }> = [
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Slate', value: '#475569' },
];

const DEFAULT_BRAND = '#6366F1';

const AppearanceCard = ({ layoutTheme, brandColor, onPatch }: AppearanceCardProps): JSX.Element => {
  const currentBrand = brandColor ?? DEFAULT_BRAND;
  const [hexInput, setHexInput] = useState(currentBrand);
  const [hexError, setHexError] = useState<string | null>(null);

  // Keep the input in sync if brand color changes elsewhere (e.g. via reset).
  useEffect(() => {
    setHexInput(brandColor ?? DEFAULT_BRAND);
    setHexError(null);
  }, [brandColor]);

  const commitHex = (): void => {
    const trimmed = hexInput.trim();
    if (trimmed === '' || trimmed.toLowerCase() === DEFAULT_BRAND.toLowerCase()) {
      onPatch({ brandColor: undefined });
      setHexError(null);
      return;
    }
    if (!isValidHex(trimmed)) {
      setHexError('Use #RRGGBB format');
      return;
    }
    const normalized = normalizeHex(trimmed);
    if (normalized) {
      onPatch({ brandColor: normalized });
      setHexInput(normalized);
      setHexError(null);
    }
  };

  const pickPreset = (hex: string): void => {
    const normalized = hex.toLowerCase();
    if (normalized === DEFAULT_BRAND.toLowerCase()) {
      onPatch({ brandColor: undefined });
    } else {
      onPatch({ brandColor: hex });
    }
    setHexInput(hex);
    setHexError(null);
  };

  const activeHex = currentBrand.toLowerCase();
  const activeLayout = normalizeLayoutTheme(layoutTheme);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" aria-hidden />
          Appearance
        </CardTitle>
        <CardDescription>
          Pick a layout style and an accent color. Light/dark mode and the chosen accent layer on
          top of any layout.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3">
          <Label id="layout-label" className="text-base">
            Layout
          </Label>
          <div role="group" aria-labelledby="layout-label" className="grid gap-2 sm:grid-cols-2">
            {LAYOUTS.map((opt) => {
              const active = activeLayout === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPatch({ layoutTheme: opt.id })}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-input bg-background hover:bg-accent',
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {active && <Check className="size-4 text-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground">{opt.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Label id="accent-label" className="text-base">
              Accent color
            </Label>
            {brandColor && (
              <button
                type="button"
                onClick={() => pickPreset(DEFAULT_BRAND)}
                className="rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Reset to default
              </button>
            )}
          </div>
          <div role="group" aria-labelledby="accent-label" className="flex flex-wrap gap-2">
            {BRAND_PRESETS.map((p) => {
              const isActive = p.value.toLowerCase() === activeHex;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => pickPreset(p.value)}
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={isActive}
                  className={cn(
                    'relative size-11 rounded-full border-2 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive
                      ? 'border-foreground'
                      : 'border-transparent ring-1 ring-border hover:border-foreground/40',
                  )}
                  style={{ backgroundColor: p.value }}
                >
                  {isActive && (
                    <Check className="absolute inset-0 m-auto size-4 text-white drop-shadow" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="grid gap-1.5 md:max-w-xs">
            <Label htmlFor="brandHex" className="text-xs">
              Custom hex
            </Label>
            <div className="flex items-center gap-2">
              <span
                className="size-7 shrink-0 rounded-md border"
                style={{ backgroundColor: isValidHex(hexInput) ? hexInput : 'transparent' }}
                aria-hidden
              />
              <Input
                id="brandHex"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onBlur={commitHex}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitHex();
                }}
                placeholder="#6366F1"
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
                aria-invalid={Boolean(hexError)}
                aria-describedby={hexError ? 'brandHex-error' : undefined}
              />
            </div>
            <FieldError id="brandHex-error" message={hexError ?? undefined} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface NotificationsCardProps {
  prefs: NotifyPrefs;
  onPatch: (patch: Partial<NotifyPrefs>) => void;
  onCheckNow: () => Promise<void>;
}

const PushControl = ({ push }: { push: WebPushApi }): JSX.Element => {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void push.getEnabled().then(setEnabled);
  }, [push]);

  const toggle = async (v: boolean): Promise<void> => {
    setBusy(true);
    if (v) {
      const res = await push.enable();
      if (res.ok) {
        setEnabled(true);
        toast.success('Browser notifications enabled on this device');
      } else {
        toast.error(res.error ?? 'Could not enable notifications');
      }
    } else {
      await push.disable();
      setEnabled(false);
      toast.success('Browser notifications disabled');
    }
    setBusy(false);
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-0.5">
        <Label htmlFor="push-enabled" className="text-base">
          Browser push notifications
        </Label>
        <p className="text-sm text-muted-foreground">
          Get renewal and trial reminders on this device — even when the app is closed. Enable once
          per device/browser.
        </p>
      </div>
      <Switch
        id="push-enabled"
        checked={enabled}
        disabled={busy}
        onCheckedChange={(v) => void toggle(v)}
      />
    </div>
  );
};

const NotificationsCard = ({ prefs, onPatch, onCheckNow }: NotificationsCardProps): JSX.Element => {
  const [quietStart, setQuietStart] = useState(prefs.quietHours?.[0] ?? '22:00');
  const [quietEnd, setQuietEnd] = useState(prefs.quietHours?.[1] ?? '08:00');
  const quietOn = Boolean(prefs.quietHours);

  const selected = new Set(prefs.globalDaysBefore);
  const toggleDay = (d: number): void => {
    const next = new Set(selected);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onPatch({ globalDaysBefore: [...next].sort((a, b) => b - a) });
  };

  const commitQuiet = (): void => {
    if (!quietOn) return;
    onPatch({ quietHours: [quietStart, quietEnd] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Reminders before renewals and trial ends. Per-subscription overrides live on each
          subscription.{' '}
          {isWeb()
            ? 'Enable browser push below to get them even when the app is closed.'
            : 'The app stays in the system tray so alerts fire even when the window is closed.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="notify-enabled" className="text-base">
              Enable notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Master switch. When off, nothing fires from this app.
            </p>
          </div>
          <Switch
            id="notify-enabled"
            checked={prefs.enabled}
            onCheckedChange={(v) => onPatch({ enabled: v })}
          />
        </div>

        {isWeb() && window.api.push?.isSupported() && <PushControl push={window.api.push} />}

        <div className="grid gap-3">
          <Label id="lead-times-label" className="text-base">
            Default lead times
          </Label>
          <p className="-mt-1 text-sm text-muted-foreground">
            Fires one alert at each threshold. Individual subscriptions can override this list.
          </p>
          <div role="group" aria-labelledby="lead-times-label" className="flex flex-wrap gap-2">
            {DAYS_SUGGESTIONS.map((d) => {
              const on = selected.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'rounded-full border px-3.5 py-2 text-sm tabular-nums transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-accent',
                  )}
                >
                  {d === 0 ? 'Day of' : `${d}d before`}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="quiet-on" className="text-base">
                Quiet hours
              </Label>
              <p className="text-sm text-muted-foreground">
                Suppress alerts during this window each day.
              </p>
            </div>
            <Switch
              id="quiet-on"
              checked={quietOn}
              onCheckedChange={(v) =>
                onPatch({ quietHours: v ? [quietStart, quietEnd] : undefined })
              }
            />
          </div>
          {quietOn && (
            <div className="grid grid-cols-2 gap-3 md:max-w-sm">
              <div className="grid gap-1.5">
                <Label htmlFor="quiet-start" className="text-xs">
                  From
                </Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  onBlur={commitQuiet}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quiet-end" className="text-xs">
                  To
                </Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  onBlur={commitQuiet}
                />
              </div>
            </div>
          )}
        </div>

        {/* System tray is desktop-only; on web, push fires via a server-side cron. */}
        {!isWeb() && (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="minimize-to-tray" className="text-base">
                Keep running in tray when window is closed
              </Label>
              <p className="text-sm text-muted-foreground">
                Closing the window hides it to the system tray so the scheduler keeps firing. Use
                the tray menu&apos;s &ldquo;Quit&rdquo; to actually exit.
              </p>
            </div>
            <Switch
              id="minimize-to-tray"
              checked={prefs.minimizeToTray}
              onCheckedChange={(v) => onPatch({ minimizeToTray: v })}
            />
          </div>
        )}

        <div>
          <Button variant="outline" onClick={() => void onCheckNow()}>
            <BellRing />
            Check renewals now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

interface AiAssistantCardProps {
  prefs: AiAssistantPrefs;
  onPatch: (patch: Partial<AiAssistantPrefs>) => void;
}

const AiAssistantCard = ({ prefs, onPatch }: AiAssistantCardProps): JSX.Element => {
  const [keyInput, setKeyInput] = useState('');
  const [secureAvailable, setSecureAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    void window.api.aiIsSecureStorageAvailable().then(setSecureAvailable);
  }, []);

  const showInput = !prefs.hasKey || replacing;

  const submitKey = async (): Promise<void> => {
    const value = keyInput.trim();
    if (!value) return;
    setSaving(true);
    const res = await window.api.aiSetKey(value);
    setSaving(false);
    if (res.ok) {
      onPatch({ hasKey: true });
      setKeyInput('');
      setReplacing(false);
      toast.success(isWeb() ? 'API key saved securely' : 'API key saved to OS keychain');
    } else if (res.reason === 'no-secure-storage') {
      toast.error('Secure storage unavailable', {
        description: "Your OS doesn't expose a keyring. The key was NOT stored.",
      });
    } else if (res.reason === 'rate-limited') {
      toast.error('Too many attempts', { description: 'Wait a minute and try again.' });
    } else if (res.reason === 'network') {
      toast.error("Couldn't reach the server", {
        description: 'Check your connection and try again.',
      });
    } else if (res.reason === 'server') {
      toast.error("Couldn't save the key", { description: 'Please try again.' });
    } else {
      toast.error('Enter a key first');
    }
  };

  const clear = async (): Promise<void> => {
    try {
      await window.api.aiClearKey();
    } catch (err) {
      toast.error("Couldn't remove the key", { description: (err as Error).message });
      return;
    }
    onPatch({ hasKey: false, enabled: false });
    toast.success('API key removed');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          AI Assistant
        </CardTitle>
        <CardDescription>
          Bring-your-own-key chat assistant powered by OpenRouter. It can read your data and (later
          phases) help you add things.{' '}
          {isWeb()
            ? 'Your key is encrypted at rest on our servers (Supabase Vault), is never sent back to your browser, and never appears in any export.'
            : "Your key is stored encrypted in your OS keychain and never touches this app's data file or any exports."}{' '}
          <button
            type="button"
            className="text-foreground underline underline-offset-2"
            onClick={() => void window.api.openExternal('https://openrouter.ai/keys')}
          >
            Get an OpenRouter key
          </button>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {secureAvailable === false && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive-ink">
            Your OS doesn&apos;t expose a secure keyring. The assistant is unavailable on this
            machine — the key would have nowhere safe to live.
          </div>
        )}

        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="ai-enabled" className="text-base">
              Enable assistant
            </Label>
            <p className="text-sm text-muted-foreground">
              Conversation contents (including subscription details the assistant reads) are sent to
              OpenRouter and the model provider you pick.
            </p>
          </div>
          <Switch
            id="ai-enabled"
            checked={prefs.enabled}
            disabled={!prefs.hasKey || secureAvailable === false}
            onCheckedChange={(v) => onPatch({ enabled: v })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ai-key" className="text-base">
            API key
          </Label>
          {showInput ? (
            <div className="flex flex-wrap items-start gap-2">
              <Input
                id="ai-key"
                type="password"
                placeholder="sk-or-v1-…"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="md:max-w-sm"
                autoComplete="off"
                spellCheck={false}
                disabled={secureAvailable === false}
              />
              <Button
                onClick={() => void submitKey()}
                disabled={!keyInput.trim() || saving || secureAvailable === false}
              >
                <KeyRound />
                Save key
              </Button>
              {replacing && (
                <Button variant="outline" onClick={() => setReplacing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success-ink">
                <Check className="size-3" />
                Key stored in OS keychain
              </span>
              <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
                Replace
              </Button>
              <Button variant="outline" size="sm" onClick={() => void clear()}>
                <Trash2 />
                Remove
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            The plaintext key only lives in main-process memory during a request. It is never sent
            to the renderer or persisted in{' '}
            <code className="rounded bg-muted px-1">subs-manager.json</code>.
          </p>
        </div>

        <div className="grid gap-2 md:max-w-sm">
          <Label htmlFor="ai-model">Model</Label>
          <Select value={prefs.model} onValueChange={(v) => onPatch({ model: v })}>
            <SelectTrigger id="ai-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="…or paste a custom OpenRouter model slug"
            aria-label="Custom OpenRouter model slug"
            value={MODEL_OPTIONS.some((m) => m.value === prefs.model) ? '' : prefs.model}
            onChange={(e) => onPatch({ model: e.target.value })}
            spellCheck={false}
            className="md:max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            Tip: <span className="font-medium text-foreground">Gemma 4 26B</span> is an affordable
            all-rounder that also reads images — a good default.
          </p>
          {!modelSupportsVision(prefs.model) && (
            <p className="text-xs text-warning-ink">
              This model can’t read images. To send screenshots in chat, pick an image-capable model
              (e.g. Gemma 4 26B).
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const AccountCard = ({ auth }: { auth: WebAuthApi }): JSX.Element => {
  const [email, setEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void auth.getEmail().then(setEmail);
  }, [auth]);

  const changePassword = async (): Promise<void> => {
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    const res = await auth.changePassword(currentPassword, newPassword);
    setBusy(false);
    if (res.ok) {
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password updated.');
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          {email ? (
            <>
              Signed in as <span className="font-medium text-foreground">{email}</span>. Your data
              syncs to this account across devices.
            </>
          ) : (
            'Loading account…'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 md:max-w-sm">
          <Label>Change password</Label>
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => void changePassword()}
              disabled={busy || currentPassword.length === 0 || newPassword.length === 0}
            >
              <KeyRound />
              Update
            </Button>
          </div>
        </div>

        <Button variant="outline" onClick={() => void auth.signOut()}>
          <LogOut />
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
};

const BackupsCard = (): JSX.Element => {
  const [backups, setBackups] = useState<Array<{ fileName: string; modifiedAt: string }>>([]);
  const [busy, setBusy] = useState(false);

  const refresh = (): void => {
    void window.api.listBackups().then(setBackups);
  };
  useEffect(refresh, []);

  const latest = backups[0];

  const doBackup = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await window.api.backupNow();
      if (res.ok) {
        toast.success('Backup saved');
        refresh();
      } else {
        toast.error('Nothing to back up yet');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="size-4 text-muted-foreground" aria-hidden />
          Backups
        </CardTitle>
        <CardDescription>
          A snapshot of your data is saved automatically once a day (the last 10 are kept). To
          restore one, use <span className="font-medium">Restore from JSON</span> above and pick a
          file from the backups folder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {latest
            ? `Last backup ${formatDistanceToNow(parseISO(latest.modifiedAt), { addSuffix: true })} · ${backups.length} kept`
            : 'No backups yet — one will be created on next launch, or back up now.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void doBackup()} disabled={busy}>
            <Save />
            {busy ? 'Backing up…' : 'Back up now'}
          </Button>
          <Button variant="outline" onClick={() => void window.api.openBackupsFolder()}>
            <FolderOpen />
            Open backups folder
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

interface DangerZoneCardProps {
  onReset: () => Promise<void>;
}

const DangerZoneCard = ({ onReset }: DangerZoneCardProps): JSX.Element => {
  // On web (signed in) the destructive action is full account deletion, which
  // removes every byte we store for you on the server. On desktop it's a local
  // data reset.
  const webAuth = isWeb() ? window.api.auth : undefined;
  const [confirming, setConfirming] = useState(false);

  const doAction = async (): Promise<void> => {
    if (webAuth) {
      const res = await webAuth.deleteAccount();
      // On success you're signed out → AuthGate takes over; nothing else to do.
      if (!res.ok) toast.error(res.error);
    } else {
      await onReset();
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive-ink">
          <AlertTriangle className="size-4" aria-hidden />
          Danger zone
        </CardTitle>
        <CardDescription>
          {webAuth ? (
            <>
              Delete your account. This permanently removes your account and{' '}
              <span className="font-medium">all data we store for you on our servers</span> — every
              subscription, purchase, category, and synced setting. You&apos;ll be signed out and
              this cannot be undone.
            </>
          ) : (
            <>
              Reset all tracked data. Wipes subscriptions, purchases, categories, cancellation log,
              and AI chat history. Preferences (theme, currency, AI key, etc.) and the data
              directory itself are kept. Files you previously exported via the Backup buttons are
              not touched — those live as separate files on disk.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          <Trash2 />
          {webAuth ? 'Delete account' : 'Reset all data'}
        </Button>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={webAuth ? 'Delete your account?' : 'Reset all data?'}
          description={
            webAuth ? (
              <p>
                This permanently deletes your account and{' '}
                <span className="font-medium text-foreground">everything we store for you</span> —
                all subscriptions, purchases, categories, and settings synced to this account. It
                cannot be undone. Export a backup first if you want a copy.
              </p>
            ) : (
              <p>
                This deletes every subscription, purchase, and category in this app. Consider
                exporting a JSON backup first.
              </p>
            )
          }
          confirmWord={webAuth ? 'DELETE' : 'RESET'}
          confirmLabel={webAuth ? 'Delete my account' : 'Reset everything'}
          workingLabel={webAuth ? 'Deleting…' : 'Resetting…'}
          destructive
          onConfirm={doAction}
        />
      </CardContent>
    </Card>
  );
};
