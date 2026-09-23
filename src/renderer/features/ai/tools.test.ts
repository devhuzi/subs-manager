import { describe, expect, it, vi } from 'vitest';
import type { AppData, Subscription } from '../../../shared/types';
import { defaultPreferences } from '../../../shared/types';
import { dispatchTool, serializeToolResult, type ToolActions, type ToolContext } from './tools';

const sub: Subscription = {
  id: 's1',
  name: 'Netflix',
  cost: 10,
  currency: 'USD',
  billingCycle: 'monthly',
  renewalDate: '2026-06-01',
  subscribedSince: '2026-01-01',
  renewals: [],
  status: 'active',
  createdAt: '',
  updatedAt: '',
};

const makeCtx = (data?: Partial<AppData>) => {
  let current: AppData = {
    version: 1,
    subscriptions: [sub],
    oneTimePurchases: [],
    categories: [],
    preferences: defaultPreferences(),
    cancellationLog: [],
    ...data,
  };
  const actions: ToolActions = {
    addSubscriptionByName: vi.fn(async (input) => ({ id: 'new', name: input.name })),
    addPurchaseByName: vi.fn(async (input) => ({ id: 'newp', name: input.name })),
    addCategory: vi.fn(async () => undefined),
    updateSubscriptionPatch: vi.fn(async () => ({ name: 'x' })),
    updatePurchasePatch: vi.fn(async () => ({ name: 'x' })),
    deleteSubscription: vi.fn(async () => undefined),
    deletePurchase: vi.fn(async () => undefined),
  };
  const requestConfirm = vi.fn(async () => ({ approved: true }));
  const ctx: ToolContext = {
    getData: () => current,
    rates: null,
    actions,
    requestConfirm,
  };
  return { ctx, actions, requestConfirm, setData: (d: AppData) => (current = d) };
};

const run = (ctx: ToolContext, name: string, args: unknown) =>
  dispatchTool(ctx, name, JSON.stringify(args), 'call-1');

describe('dispatchTool argument validation', () => {
  it('adds a valid subscription, normalizing currency and numeric strings', async () => {
    const { ctx, actions } = makeCtx();
    const r = await run(ctx, 'add_subscription', {
      name: 'Spotify',
      cost: '11.99',
      currency: 'usd',
      billingCycle: 'monthly',
      renewalDate: '2026-06-10',
      categoryName: 'Music',
    });
    expect(r.status).toBe('ok');
    expect(actions.addSubscriptionByName).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Spotify', cost: 11.99, currency: 'USD', status: 'active' }),
      'Music',
    );
  });

  it.each([
    [{ cost: -5 }, /cost/],
    [{ cost: 'abc' }, /cost/],
    [{ cost: '' }, /cost/],
    [{ billingCycle: 'weekly' }, /billingCycle/],
    [{ renewalDate: '06/10/2026' }, /renewalDate/],
    [{ website: 'javascript:alert(1)' }, /website/],
  ])('rejects bad add args %j before asking for confirmation', async (bad, msg) => {
    const { ctx, requestConfirm, actions } = makeCtx();
    const r = await run(ctx, 'add_subscription', {
      name: 'Spotify',
      cost: 5,
      currency: 'USD',
      billingCycle: 'monthly',
      renewalDate: '2026-06-10',
      ...bad,
    });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.error).toMatch(msg);
    expect(requestConfirm).not.toHaveBeenCalled();
    expect(actions.addSubscriptionByName).not.toHaveBeenCalled();
  });

  it('passes only whitelisted, validated fields to an update', async () => {
    const { ctx, actions } = makeCtx();
    const r = await run(ctx, 'update_subscription', {
      id: 's1',
      patch: { cost: '12', status: 'inactive', paymentMethod: 'Amex' },
    });
    expect(r.status).toBe('ok');
    expect(actions.updateSubscriptionPatch).toHaveBeenCalledWith('s1', {
      cost: 12,
      status: 'inactive',
      paymentMethod: 'Amex',
    });
  });

  it.each([{ id: 'hijack' }, { renewals: [] }, { firedAlerts: [] }, { createdAt: 'x' }])(
    'rejects non-editable patch key %j',
    async (patch) => {
      const { ctx, actions } = makeCtx();
      const r = await run(ctx, 'update_subscription', { id: 's1', patch });
      expect(r.status).toBe('error');
      if (r.status === 'error') expect(r.error).toMatch(/Unrecognized key/);
      expect(actions.updateSubscriptionPatch).not.toHaveBeenCalled();
    },
  );

  it('rejects a negative cost in an update', async () => {
    const { ctx } = makeCtx();
    const r = await run(ctx, 'update_subscription', { id: 's1', patch: { cost: -1 } });
    expect(r.status).toBe('error');
  });

  it('bulk add keeps valid items and reports invalid ones', async () => {
    const { ctx, actions } = makeCtx();
    const r = await run(ctx, 'add_purchases_bulk', {
      items: [
        { name: 'Laptop', cost: 1000, currency: 'USD', purchaseDate: '2026-01-01' },
        { name: 'Bad', cost: Infinity, currency: 'USD', purchaseDate: '2026-01-01' },
        { name: 'Bad date', cost: 5, currency: 'USD', purchaseDate: 'yesterday' },
      ],
    });
    expect(r.status).toBe('ok');
    expect(actions.addPurchaseByName).toHaveBeenCalledTimes(1);
    if (r.status === 'ok') {
      const res = r.result as { added: number; skipped: number; invalid: Array<{ index: number }> };
      expect(res.added).toBe(1);
      expect(res.skipped).toBe(2);
      expect(res.invalid.map((x) => x.index)).toEqual([1, 2]);
    }
  });

  it('reads data through the getter each call (sees later writes)', async () => {
    const { ctx, setData } = makeCtx();
    const first = await run(ctx, 'read_subscriptions', {});
    setData({ ...ctx.getData(), subscriptions: [sub, { ...sub, id: 's2', name: 'Hulu' }] });
    const second = await run(ctx, 'read_subscriptions', {});
    expect((first as { result: unknown[] }).result).toHaveLength(1);
    expect((second as { result: unknown[] }).result).toHaveLength(2);
  });
});

describe('serializeToolResult', () => {
  it('returns plain JSON when under budget', () => {
    expect(serializeToolResult({ a: 1 })).toBe('{"a":1}');
  });

  it('caps large arrays and stays valid JSON within budget', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}`, name: `Item ${i}` }));
    const out = serializeToolResult(rows, 2000);
    expect(out.length).toBeLessThanOrEqual(2000);
    const parsed = JSON.parse(out) as { items: unknown[]; truncated: boolean; total: number };
    expect(parsed.truncated).toBe(true);
    expect(parsed.total).toBe(500);
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items.length).toBeLessThan(500);
  });

  it('replaces an oversized non-array with a valid JSON note', () => {
    const out = serializeToolResult({ blob: 'x'.repeat(100) }, 50);
    expect(JSON.parse(out)).toMatchObject({ truncated: true });
  });
});
