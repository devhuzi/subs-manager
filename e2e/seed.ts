import { defaultPreferences, type AppData, type FxRates, type Subscription } from '@shared/types';

// Dates are computed relative to "now" so renewals land in the upcoming windows
// (≤2d / ≤7d / ≤30d) that drive the dashboard urgency colors.
const today = new Date();
const iso = (d: Date): string => d.toISOString();
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (n: number): Date => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};

const sub = (s: Omit<Subscription, 'renewals' | 'createdAt' | 'updatedAt'>): Subscription => ({
  ...s,
  renewals: [
    { id: `${s.id}-r0`, date: s.renewalDate, cost: s.cost, currency: s.currency, enabled: true },
  ],
  createdAt: iso(addDays(-400)),
  updatedAt: iso(addDays(-10)),
});

export const seedRates: FxRates = {
  base: 'USD',
  fetchedAt: iso(addDays(-1)),
  rates: { USD: 1, EUR: 1.08, GBP: 1.27, AUD: 0.66, CAD: 0.74, JPY: 0.0067 },
};

export const seedData: AppData = {
  version: 1,
  categories: [
    { id: 'cat-software', name: 'Software', color: '#6366F1', monthlyBudget: 80 },
    { id: 'cat-media', name: 'Entertainment', color: '#EC4899', monthlyBudget: 40 },
    { id: 'cat-cloud', name: 'Cloud & Infra', color: '#0EA5E9' },
    { id: 'cat-ai', name: 'AI Tools', color: '#10B981', monthlyBudget: 50 },
  ],
  subscriptions: [
    sub({
      id: 'sub-figma',
      name: 'Figma',
      cost: 15,
      currency: 'USD',
      billingCycle: 'monthly',
      renewalDate: dateOnly(addDays(1)),
      subscribedSince: dateOnly(addDays(-380)),
      status: 'active',
      categoryId: 'cat-software',
      website: 'figma.com',
      brandColor: '#A259FF',
      paymentMethod: 'Amex …1009',
    }),
    sub({
      id: 'sub-netflix',
      name: 'Netflix',
      cost: 17.99,
      currency: 'USD',
      billingCycle: 'monthly',
      renewalDate: dateOnly(addDays(5)),
      subscribedSince: dateOnly(addDays(-700)),
      status: 'active',
      categoryId: 'cat-media',
      website: 'netflix.com',
      brandColor: '#E50914',
      paymentMethod: 'Visa …4242',
    }),
    sub({
      id: 'sub-adobe',
      name: 'Adobe Creative Cloud',
      cost: 59.99,
      currency: 'EUR',
      billingCycle: 'monthly',
      renewalDate: dateOnly(addDays(12)),
      subscribedSince: dateOnly(addDays(-500)),
      status: 'active',
      categoryId: 'cat-software',
      website: 'adobe.com',
      brandColor: '#FF0000',
    }),
    sub({
      id: 'sub-github',
      name: 'GitHub Copilot',
      cost: 10,
      currency: 'USD',
      billingCycle: 'monthly',
      renewalDate: dateOnly(addDays(20)),
      subscribedSince: dateOnly(addDays(-200)),
      status: 'active',
      categoryId: 'cat-ai',
      website: 'github.com',
    }),
    sub({
      id: 'sub-spotify',
      name: 'Spotify',
      cost: 11.99,
      currency: 'GBP',
      billingCycle: 'monthly',
      renewalDate: dateOnly(addDays(26)),
      subscribedSince: dateOnly(addDays(-900)),
      status: 'active',
      categoryId: 'cat-media',
      website: 'spotify.com',
      brandColor: '#1DB954',
    }),
    sub({
      id: 'sub-aws',
      name: 'AWS',
      cost: 240,
      currency: 'USD',
      billingCycle: 'yearly',
      renewalDate: dateOnly(addDays(60)),
      subscribedSince: dateOnly(addDays(-365)),
      status: 'active',
      categoryId: 'cat-cloud',
      website: 'aws.amazon.com',
    }),
    sub({
      id: 'sub-claude',
      name: 'Claude Pro',
      cost: 20,
      currency: 'USD',
      billingCycle: 'monthly',
      renewalDate: dateOnly(addDays(3)),
      subscribedSince: dateOnly(addDays(-30)),
      status: 'active',
      categoryId: 'cat-ai',
      website: 'claude.ai',
      brandColor: '#D97757',
      trial: { endsAt: dateOnly(addDays(2)), convertsToCost: 20 },
    }),
    sub({
      id: 'sub-old',
      name: 'Dropbox',
      cost: 9.99,
      currency: 'USD',
      billingCycle: 'monthly',
      renewalDate: dateOnly(addDays(-5)),
      subscribedSince: dateOnly(addDays(-1100)),
      status: 'inactive',
      categoryId: 'cat-cloud',
      website: 'dropbox.com',
    }),
  ],
  oneTimePurchases: [
    {
      id: 'buy-keyboard',
      name: 'Keychron Q1',
      cost: 199,
      currency: 'USD',
      purchaseDate: dateOnly(addDays(-120)),
      categoryId: 'cat-software',
      expectedLifespanMonths: 48,
      website: 'keychron.com',
      createdAt: iso(addDays(-120)),
      updatedAt: iso(addDays(-120)),
    },
    {
      id: 'buy-sketch',
      name: 'Sketch License',
      cost: 99,
      currency: 'USD',
      purchaseDate: dateOnly(addDays(-300)),
      categoryId: 'cat-software',
      expectedLifespanMonths: 12,
      website: 'sketch.com',
      createdAt: iso(addDays(-300)),
      updatedAt: iso(addDays(-300)),
    },
    {
      id: 'buy-domain',
      name: 'Domain (3yr)',
      cost: 36,
      currency: 'USD',
      purchaseDate: dateOnly(addDays(-60)),
      categoryId: 'cat-cloud',
      expectedLifespanMonths: 36,
      createdAt: iso(addDays(-60)),
      updatedAt: iso(addDays(-60)),
    },
  ],
  preferences: {
    ...defaultPreferences(),
    defaultCurrency: 'USD',
    // Enabled so the floating AI button renders in the harness (for layout
    // verification). The mock aiChat is an inert stub.
    aiAssistant: { enabled: true, model: 'anthropic/claude-sonnet-4', hasKey: true },
  },
  cancellationLog: [
    {
      id: 'cl-1',
      subscriptionName: 'Hulu',
      monthlyEquivalent: 12.99,
      currency: 'USD',
      cancelledAt: iso(addDays(-45)),
    },
    {
      id: 'cl-2',
      subscriptionName: 'Notion AI',
      monthlyEquivalent: 10,
      currency: 'USD',
      cancelledAt: iso(addDays(-90)),
    },
  ],
};
