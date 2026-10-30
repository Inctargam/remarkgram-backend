import type { QueryBus } from '@nestjs/cqrs';
import { describe, expect, it, vi } from 'vitest';
import { HasActiveSubscriptionQuery } from '../../application/use-cases/has-active-subscription/has-active-subscription.query-handler.js';
import { LocalSubscriptionContextAdapter } from './local-subscription-context.adapter.js';

describe('LocalSubscriptionContextAdapter', () => {
  it.each([false, true])('returns %s through the D1 boolean contract', async (hasActiveSubscription) => {
    const queryBus = { execute: vi.fn().mockResolvedValue(hasActiveSubscription) };
    const adapter = new LocalSubscriptionContextAdapter(queryBus as unknown as QueryBus);

    await expect(adapter.hasActiveSubscription(42)).resolves.toBe(hasActiveSubscription);
    expect(queryBus.execute).toHaveBeenCalledExactlyOnceWith(new HasActiveSubscriptionQuery(42));
  });

  it('propagates read errors to D1 instead of reporting no subscription', async () => {
    const error = new Error('read failed');
    const queryBus = { execute: vi.fn().mockRejectedValue(error) };
    const adapter = new LocalSubscriptionContextAdapter(queryBus as unknown as QueryBus);

    await expect(adapter.hasActiveSubscription(42)).rejects.toBe(error);
  });
});
