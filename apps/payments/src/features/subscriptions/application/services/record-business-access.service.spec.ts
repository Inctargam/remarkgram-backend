import { describe, expect, it, vi } from 'vitest';
import { PaymentProvider } from '../../../payments/domain/payment.entity.js';
import { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';
import type { BusinessAccessEvents } from '../ports/business-access-events.js';
import type { SubscriptionsRepository } from '../ports/subscriptions.repository.js';
import type { SubscriptionForPayment } from '../types/subscriptions.types.js';
import { RecordBusinessAccessService } from './record-business-access.service.js';

const now = new Date('2026-11-03T12:00:00.000Z');

describe('RecordBusinessAccessService', () => {
  it.each([
    [SubscriptionStatus.ACTIVE, '2026-11-03T12:00:00.000Z', '2026-12-03T12:00:00.000Z', true],
    [SubscriptionStatus.PENDING, '2026-11-03T12:00:00.000Z', '2026-12-03T12:00:00.000Z', true],
    [SubscriptionStatus.PENDING, '2026-11-04T12:00:00.000Z', '2026-12-04T12:00:00.000Z', false],
    [SubscriptionStatus.ACTIVE, '2026-10-03T12:00:00.000Z', '2026-11-03T12:00:00.000Z', false],
    [SubscriptionStatus.EXPIRED, '2026-11-01T12:00:00.000Z', '2026-12-01T12:00:00.000Z', false],
  ] as const)('calculates access for %s between %s and %s', async (status, start, end, expected) => {
    const { service, repository, events, tx } = fixture([
      subscription({ status, startsAt: new Date(start), expiresAt: new Date(end) }),
    ]);

    await service.execute(42, tx, now);

    expect(repository.findByUserId).toHaveBeenCalledExactlyOnceWith(42, tx);
    expect(events.addSnapshot).toHaveBeenCalledExactlyOnceWith(42, expected, tx);
  });

  it('keeps access enabled when the previous period has expired and the next is current', async () => {
    const { service, events, tx } = fixture([
      subscription({ status: SubscriptionStatus.EXPIRED, expiresAt: now }),
      subscription({ subscriptionId: 'next', startsAt: now }),
    ]);

    await service.execute(42, tx, now);

    expect(events.addSnapshot).toHaveBeenCalledExactlyOnceWith(42, true, tx);
  });

  it('records no access when there is no paid period', async () => {
    const { service, events, tx } = fixture([]);
    await service.execute(42, tx, now);
    expect(events.addSnapshot).toHaveBeenCalledExactlyOnceWith(42, false, tx);
  });

  it('propagates outbox failures to the owning transaction', async () => {
    const { service, events, tx } = fixture([]);
    const failure = new Error('outbox unavailable');
    events.addSnapshot.mockRejectedValue(failure);
    await expect(service.execute(42, tx, now)).rejects.toBe(failure);
  });
});

function subscription(overrides: Partial<SubscriptionForPayment> = {}): SubscriptionForPayment {
  return {
    subscriptionId: 'subscription', planId: 1, provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_current', autoRenewalStatus: AutoRenewalStatus.DISABLED,
    status: SubscriptionStatus.ACTIVE, startsAt: new Date('2026-11-01T12:00:00.000Z'),
    expiresAt: new Date('2026-12-01T12:00:00.000Z'), ...overrides,
  };
}

function fixture(subscriptions: SubscriptionForPayment[]) {
  const repository = { findByUserId: vi.fn().mockResolvedValue(subscriptions) };
  const events = { addSnapshot: vi.fn<BusinessAccessEvents['addSnapshot']>().mockResolvedValue() };
  return {
    repository, events, tx: {},
    service: new RecordBusinessAccessService(repository as unknown as SubscriptionsRepository, events),
  };
}
