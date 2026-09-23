import { describe, expect, it } from 'vitest';
import type { AppData, Subscription } from '../shared/types';
import { mergeFiredAlerts } from './firedAlerts';

const sub = (id: string, firedAlerts?: string[]): Subscription =>
  ({ id, name: id, firedAlerts }) as unknown as Subscription;

const data = (subscriptions: Subscription[]): AppData =>
  ({ subscriptions }) as unknown as AppData;

describe('mergeFiredAlerts', () => {
  it('restores keys the scheduler wrote after the renderer took its snapshot', () => {
    const incoming = data([sub('a', ['2026-06-01:7'])]);
    const disk = data([sub('a', ['2026-06-01:7', '2026-06-01:1'])]);
    const out = mergeFiredAlerts(incoming, disk);
    expect(out.subscriptions[0].firedAlerts).toEqual(['2026-06-01:7', '2026-06-01:1']);
  });

  it('fills keys onto a sub whose snapshot had none', () => {
    const out = mergeFiredAlerts(data([sub('a')]), data([sub('a', ['k:1'])]));
    expect(out.subscriptions[0].firedAlerts).toEqual(['k:1']);
  });

  it('keeps keys only present in the incoming data (union, not overwrite)', () => {
    const out = mergeFiredAlerts(data([sub('a', ['x:1'])]), data([sub('a', ['y:2'])]));
    expect(out.subscriptions[0].firedAlerts).toEqual(['x:1', 'y:2']);
  });

  it('drops keys for subscriptions that no longer exist', () => {
    const out = mergeFiredAlerts(data([sub('a')]), data([sub('gone', ['k:1'])]));
    expect(out.subscriptions).toHaveLength(1);
    expect(out.subscriptions[0].firedAlerts).toBeUndefined();
  });

  it('returns the same object when nothing changes', () => {
    const incoming = data([sub('a', ['k:1'])]);
    expect(mergeFiredAlerts(incoming, data([sub('a', ['k:1'])]))).toBe(incoming);
    expect(mergeFiredAlerts(incoming, null)).toBe(incoming);
  });
});
