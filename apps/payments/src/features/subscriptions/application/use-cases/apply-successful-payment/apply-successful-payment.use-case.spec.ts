import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency } from '../../../../../common/domain/currency.enum.js';
import { PeriodUnit } from '../../../../../common/domain/period-unit.enum.js';
import { PaymentProvider, PaymentType } from '../../../../payments/domain/payment.entity.js';
import type { SuccessfulPayment } from '../../../../payments/application/types/successful-payment.types.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type { AutoRenewalOperation, SubscriptionForPayment } from '../../types/subscriptions.types.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import { SubscriptionStatus } from '../../../domain/enums/subscription-status.enum.js';
import {
  ApplySuccessfulPaymentCommand,
  ApplySuccessfulPaymentUseCase,
} from './apply-successful-payment.use-case.js';

describe('ApplySuccessfulPaymentUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('creates the first paid period with its provider binding and replay result in the supplied transaction', async () => {
    const { useCase, repository, command } = fixture();
    const result = await useCase.execute(command);

    expect(result).toEqual({
      subscriptionId: expect.any(String),
      action: 'CREATED',
      nextSubscriptionStartsAt: '2026-11-23T10:00:00.000Z',
      previousProviderSubscriptionId: null,
    });
    expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
      {
        paymentId: command.payment.paymentId,
        userId: 42,
        planId: 7,
        startsAt: new Date(command.payment.paidAt),
        expiresAt: new Date(result.nextSubscriptionStartsAt),
        status: SubscriptionStatus.ACTIVE,
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: 'sub_initial',
        autoRenewalStatus: AutoRenewalStatus.ENABLED,
        subscriptionId: result.subscriptionId,
        action: 'CREATED',
        autoRenewalTransfer: null,
      },
      command.tx,
    );
  });

  it('waits for the user lock before reading and returns a previous result without creating another period', async () => {
    const { useCase, repository, command } = fixture();
    let releaseLock!: () => void;
    repository.lockByUserId.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseLock = resolve;
      }),
    );
    const saved = {
      subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      action: 'CREATED' as const,
      nextSubscriptionStartsAt: '2026-11-23T10:00:00.000Z',
      previousProviderSubscriptionId: null,
    };
    repository.findPaymentApplication.mockResolvedValue({
      paymentId: command.payment.paymentId,
      userId: 42,
      result: saved,
      autoRenewalOperation: null,
    });

    const pending = useCase.execute(command);
    expect(repository.findPaymentApplication).not.toHaveBeenCalled();
    releaseLock();
    await expect(pending).resolves.toEqual(saved);
    expect(repository.findByUserId).not.toHaveBeenCalled();
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });

  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING])(
    'schedules a purchase after an existing %s period',
    async (status) => {
      const { useCase, repository, command } = fixture();
      repository.findByUserId.mockResolvedValue([
        existing({
          status,
          startsAt: new Date('2026-10-25T00:00:00.000Z'),
          expiresAt: new Date('2026-11-25T00:00:00.000Z'),
        }),
      ]);

      await expect(useCase.execute(command)).resolves.toMatchObject({
        action: 'SCHEDULED',
        nextSubscriptionStartsAt: '2026-12-25T00:00:00.000Z',
        previousProviderSubscriptionId: 'sub_old',
      });
      expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          autoRenewalTransfer: {
            operationId: expect.any(String),
            sourceSubscriptionId: 'old-subscription',
            sourceProviderSubscriptionId: 'sub_old',
          },
          startsAt: new Date('2026-11-25T00:00:00.000Z'),
          status: SubscriptionStatus.PENDING,
          providerSubscriptionId: null,
          autoRenewalStatus: AutoRenewalStatus.ENABLING,
        }),
        command.tx,
      );
      const [created] = repository.createWithPaymentApplication.mock.calls[0];
      expect(created.autoRenewalTransfer?.operationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.autoRenewalTransfer?.operationId).not.toBe(command.payment.paymentId);
      expect(repository.setAutoRenewalState).toHaveBeenCalledWith(
        {
          subscriptionId: 'old-subscription',
          status: AutoRenewalStatus.DISABLING,
        },
        command.tx,
      );
      expect(repository.markExpired).not.toHaveBeenCalled();
    },
  );

  it('expires a stale ACTIVE row before starting a non-overlapping new subscription', async () => {
    const { useCase, repository, command } = fixture();
    repository.findByUserId.mockResolvedValue([existing({ status: SubscriptionStatus.ACTIVE })]);

    await useCase.execute(command);

    expect(repository.markExpired).toHaveBeenCalledWith(['old-subscription'], command.tx);
    expect(repository.markExpired.mock.invocationCallOrder[0]).toBeLessThan(
      repository.createWithPaymentApplication.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['2026-10-23T12:00:00.000Z', '2026-10-23T12:00:00.000Z', '2026-11-23T12:00:00.000Z'],
    ['2026-10-23T12:00:02.000Z', '2026-10-23T12:00:02.000Z', '2026-11-23T12:00:02.000Z'],
  ])(
    'starts an independent purchase at payment %s when earlier periods have ended',
    async (paidAt, expectedStart, expectedEnd) => {
      vi.setSystemTime(new Date('2026-10-23T12:00:03.000Z'));
      const { useCase, repository, command } = fixture({ paidAt });
      repository.findByUserId.mockResolvedValue([
        existing({
          subscriptionId: 'latest-subscription',
          startsAt: new Date('2026-10-01T00:00:00.000Z'),
          expiresAt: new Date('2026-10-23T12:00:00.000Z'),
        }),
        existing(),
      ]);

      await expect(useCase.execute(command)).resolves.toMatchObject({
        action: 'CREATED',
        nextSubscriptionStartsAt: expectedEnd,
      });
      expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          startsAt: new Date(expectedStart),
          expiresAt: new Date(expectedEnd),
          autoRenewalTransfer: null,
        }),
        command.tx,
      );
      expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['2026-10-23T11:59:59.000Z', SubscriptionStatus.PENDING],
    ['2026-10-23T12:00:03.000Z', SubscriptionStatus.ACTIVE],
  ] as const)('keeps the purchase scheduled when processed at %s', async (processedAt, status) => {
    vi.setSystemTime(new Date(processedAt));
    const { useCase, repository, command } = fixture({ paidAt: '2026-10-23T11:59:58.000Z' });
    repository.findByUserId.mockResolvedValue([
      existing({
        startsAt: new Date('2026-10-01T00:00:00.000Z'),
        expiresAt: new Date('2026-10-23T12:00:00.000Z'),
        status: SubscriptionStatus.ACTIVE,
      }),
    ]);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: '2026-11-23T12:00:00.000Z',
      previousProviderSubscriptionId: 'sub_old',
    });
    expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: new Date('2026-10-23T12:00:00.000Z'),
        expiresAt: new Date('2026-11-23T12:00:00.000Z'),
        status,
        autoRenewalStatus: AutoRenewalStatus.ENABLING,
        autoRenewalTransfer: expect.objectContaining({ sourceSubscriptionId: 'old-subscription' }),
      }),
      command.tx,
    );
    expect(repository.setAutoRenewalState).toHaveBeenCalledWith(
      { subscriptionId: 'old-subscription', status: AutoRenewalStatus.DISABLING },
      command.tx,
    );
  });

  it.each([AutoRenewalStatus.ENABLING, AutoRenewalStatus.DISABLING])(
    'rejects a conflicting %s operation even on an expired period',
    async (autoRenewalStatus) => {
      const { useCase, repository, command } = fixture();
      repository.findByUserId.mockResolvedValue([existing({ autoRenewalStatus })]);
      await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'AUTO_RENEWAL_CHANGE_IN_PROGRESS' });
      expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined])(
    'rejects an initial purchase without a provider binding: %s',
    async (providerSubscriptionId) => {
      const { useCase, repository, command } = fixture({ providerSubscriptionId });
      await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'PROVIDER_SUBSCRIPTION_MISSING' });
      expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
    },
  );

  it('starts a new subscription at paidAt after expiry with old auto-renewal disabled', async () => {
    const { useCase, repository, command } = fixture();
    repository.findByUserId.mockResolvedValue([existing()]);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      action: 'CREATED',
      nextSubscriptionStartsAt: '2026-11-23T10:00:00.000Z',
      previousProviderSubscriptionId: null,
    });
    expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: new Date(command.payment.paidAt),
        expiresAt: new Date('2026-11-23T10:00:00.000Z'),
        status: SubscriptionStatus.ACTIVE,
        autoRenewalStatus: AutoRenewalStatus.ENABLED,
        autoRenewalTransfer: null,
      }),
      command.tx,
    );
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
  });

  it.each([false, null])(
    'rejects an initial purchase without requested auto-renewal: %s',
    async (autoRenewalRequested) => {
      const { useCase, repository, command } = fixture({
        autoRenewalRequested,
      });
      await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'PURCHASE_AUTO_RENEWAL_REQUIRED' });
      expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
    },
  );

  it('does not treat a renewal as a first purchase', async () => {
    const { useCase, repository, command } = fixture({ type: PaymentType.RENEWAL });
    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'RENEWAL_SUBSCRIPTION_NOT_FOUND' });
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });

  it('appends after the last PENDING subscription in the user queue', async () => {
    const { useCase, repository, command } = fixture({
      providerSubscriptionId: null,
    });
    repository.findByUserId.mockResolvedValue([
      existing({
        subscriptionId: 'pending-subscription',
        providerSubscriptionId: 'sub_pending',
        startsAt: new Date('2026-11-01T00:00:00.000Z'),
        expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        status: SubscriptionStatus.PENDING,
        autoRenewalStatus: AutoRenewalStatus.ENABLED,
      }),
      existing({
        expiresAt: new Date('2026-11-01T00:00:00.000Z'),
        status: SubscriptionStatus.ACTIVE,
        autoRenewalStatus: AutoRenewalStatus.RETIRED,
      }),
    ]);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      action: 'SCHEDULED',
      previousProviderSubscriptionId: 'sub_pending',
      nextSubscriptionStartsAt: '2027-01-01T00:00:00.000Z',
    });
    expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        autoRenewalTransfer: expect.objectContaining({ sourceSubscriptionId: 'pending-subscription' }),
        startsAt: new Date('2026-12-01T00:00:00.000Z'),
      }),
      command.tx,
    );
  });

  it.each(['CREATED', 'SCHEDULED', 'RENEWED'] as const)(
    'replays %s even when subscription dates and auto-renewal have subsequently changed',
    async (action) => {
      const { useCase, repository, command } = fixture();
      const saved = {
        subscriptionId: 'applied-subscription',
        action,
        nextSubscriptionStartsAt: '2026-11-01T00:00:00.000Z',
        previousProviderSubscriptionId: action === 'SCHEDULED' ? 'sub_old' : null,
      };
      repository.findPaymentApplication.mockResolvedValue({
        paymentId: command.payment.paymentId,
        userId: 42,
        result: saved,
        autoRenewalOperation:
          action === 'SCHEDULED'
            ? {
                ...transferOperation(command.payment.paymentId, saved.subscriptionId),
                status: AutoRenewalOperationStatus.COMPLETED,
                providerSubscriptionId: 'sub_bound',
              }
            : null,
      });
      repository.findByUserId.mockResolvedValue([
        existing({ autoRenewalStatus: AutoRenewalStatus.DISABLING }),
      ]);

      await expect(useCase.execute(command)).resolves.toEqual(saved);
      expect(repository.findByUserId).not.toHaveBeenCalled();
      expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
      expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
      expect(repository.renewWithPaymentApplication).not.toHaveBeenCalled();
    },
  );

  it.each([
    AutoRenewalOperationStatus.DISABLE_PENDING,
    AutoRenewalOperationStatus.BINDING_PENDING,
  ])('replays a scheduled result during %s without restarting the transition', async (status) => {
    const { useCase, repository, command } = fixture();
    const result = {
      subscriptionId: 'queued-subscription',
      action: 'SCHEDULED' as const,
      nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
      previousProviderSubscriptionId: 'sub_old',
    };
    repository.findPaymentApplication.mockResolvedValue({
      paymentId: command.payment.paymentId,
      userId: 42,
      result,
      autoRenewalOperation: {
        ...transferOperation(command.payment.paymentId, result.subscriptionId),
        status,
      },
    });

    await expect(useCase.execute(command)).resolves.toEqual(result);
    expect(repository.findByUserId).not.toHaveBeenCalled();
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
  });

  it('does not request recurring billing when a scheduled purchase did not request auto-renewal', async () => {
    const { useCase, repository, command } = fixture({ autoRenewalRequested: false });
    repository.findByUserId.mockResolvedValue([
      existing({ expiresAt: new Date('2026-11-01T00:00:00.000Z') }),
    ]);

    await expect(useCase.execute(command)).rejects.toMatchObject({
      reason: 'PURCHASE_AUTO_RENEWAL_REQUIRED',
    });
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });

  it.each([
    { providerSubscriptionId: null },
    { autoRenewalStatus: AutoRenewalStatus.RETIRED },
  ])('rejects an unusable source binding before scheduling: %j', async (overrides) => {
    const { useCase, repository, command } = fixture();
    repository.findByUserId.mockResolvedValue([
      existing({ expiresAt: new Date('2026-11-01T00:00:00.000Z'), ...overrides }),
    ]);

    await expect(useCase.execute(command)).rejects.toMatchObject({
      reason: 'PREVIOUS_PROVIDER_SUBSCRIPTION_MISSING',
    });
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });

  it.each([AutoRenewalStatus.ENABLED, AutoRenewalStatus.DISABLED, AutoRenewalStatus.RETIRED])(
    'restores ACTIVE after period expiry without changing %s auto-renewal',
    async (autoRenewalStatus) => {
      vi.setSystemTime(new Date('2026-10-01T00:00:03.000Z'));
      const { useCase, repository, command } = fixture({
        type: PaymentType.RENEWAL,
        autoRenewalRequested: null,
        providerSubscriptionId: 'sub_old',
        paidAt: '2026-10-01T00:00:00.000Z',
      });
      repository.findByUserId.mockResolvedValue([existing({ autoRenewalStatus })]);

      const result = await useCase.execute(command);

      expect(result).toEqual({
        subscriptionId: 'old-subscription',
        action: 'RENEWED',
        nextSubscriptionStartsAt: '2026-11-01T00:00:00.000Z',
        previousProviderSubscriptionId: null,
      });
      expect(repository.renewWithPaymentApplication).toHaveBeenCalledWith(
        {
          paymentId: command.payment.paymentId,
          expiresAt: new Date('2026-11-01T00:00:00.000Z'),
          status: SubscriptionStatus.ACTIVE,
          subscriptionId: result.subscriptionId,
        },
        command.tx,
      );
      expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
      expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    },
  );

  it('rejects a renewal for a different plan', async () => {
    const { useCase, repository, command } = fixture({
      type: PaymentType.RENEWAL,
      providerSubscriptionId: 'sub_old',
      planId: 99,
    });
    repository.findByUserId.mockResolvedValue([existing()]);

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'RENEWAL_PLAN_MISMATCH' });
    expect(repository.renewWithPaymentApplication).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', SubscriptionStatus.ACTIVE, 7],
    ['2027-01-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z', SubscriptionStatus.PENDING, 99],
    ['2026-10-01T00:00:00.000Z', '2026-10-10T00:00:00.000Z', SubscriptionStatus.EXPIRED, 99],
  ] as const)(
    'rejects renewal when a later paid period exists: %s — %s (%s, plan %s)',
    async (startsAt, expiresAt, status, planId) => {
      const { useCase, repository, command } = fixture({
        type: PaymentType.RENEWAL,
        providerSubscriptionId: 'sub_old',
      });
      repository.findByUserId.mockResolvedValue([
        existing({ autoRenewalStatus: AutoRenewalStatus.RETIRED }),
        existing({
          subscriptionId: 'later-subscription',
          providerSubscriptionId: 'sub_later',
          startsAt: new Date(startsAt),
          expiresAt: new Date(expiresAt),
          status,
          planId,
        }),
      ]);

      await expect(useCase.execute(command)).rejects.toMatchObject({
        paymentId: command.payment.paymentId,
        reason: 'RENEWAL_SUBSCRIPTION_NOT_LAST',
      });
      expect(repository.renewWithPaymentApplication).not.toHaveBeenCalled();
      expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
      expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    },
  );

  it('renews the last subscription when earlier paid periods exist', async () => {
    const { useCase, repository, command } = fixture({
      type: PaymentType.RENEWAL,
      providerSubscriptionId: 'sub_old',
    });
    repository.findByUserId.mockResolvedValue([
      existing({
        subscriptionId: 'earlier-subscription',
        providerSubscriptionId: 'sub_earlier',
        startsAt: new Date('2026-08-01T00:00:00.000Z'),
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
      existing(),
    ]);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      action: 'RENEWED',
      subscriptionId: 'old-subscription',
      nextSubscriptionStartsAt: '2026-11-01T00:00:00.000Z',
    });
    expect(repository.renewWithPaymentApplication).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['2026-01-31T10:00:00.000Z', PeriodUnit.MONTH, 1, '2026-02-28T10:00:00.000Z'],
    ['2024-01-31T10:00:00.000Z', PeriodUnit.MONTH, 1, '2024-02-29T10:00:00.000Z'],
    ['2026-01-31T10:00:00.000Z', PeriodUnit.MONTH, 2, '2026-03-31T10:00:00.000Z'],
    ['2026-10-23T10:00:00.000Z', PeriodUnit.DAY, 2, '2026-10-25T10:00:00.000Z'],
    ['2026-10-23T10:00:00.000Z', PeriodUnit.WEEK, 2, '2026-11-06T10:00:00.000Z'],
  ] as const)('calculates %s + %s × %s', async (paidAt, periodUnit, periodCount, expectedEnd) => {
    vi.setSystemTime(new Date(paidAt));
    const { useCase, command } = fixture({ paidAt, periodUnit, periodCount });
    await expect(useCase.execute(command)).resolves.toMatchObject({ nextSubscriptionStartsAt: expectedEnd });
  });

  it.each(['invalid-date', '+275760-09-13T00:00:00.000Z'])(
    'rejects an invalid or overflowing period starting at %s before writing',
    async (paidAt) => {
      const { useCase, repository, command } = fixture({ paidAt });
      await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'INVALID_PERIOD' });
      expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
    },
  );

  it('propagates a persistence failure so the caller can roll back the transaction', async () => {
    const { useCase, repository, command } = fixture();
    const error = new Error('database unavailable');
    repository.createWithPaymentApplication.mockRejectedValue(error);
    await expect(useCase.execute(command)).rejects.toBe(error);
  });

  it('propagates a scheduled purchase failure so the previous auto-renewal change can roll back', async () => {
    const { useCase, repository, command } = fixture({ providerSubscriptionId: null });
    repository.findByUserId.mockResolvedValue([
      existing({ expiresAt: new Date('2026-11-01T00:00:00.000Z') }),
    ]);
    const error = new Error('payment application insert failed');
    repository.createWithPaymentApplication.mockRejectedValue(error);

    await expect(useCase.execute(command)).rejects.toBe(error);
    expect(repository.setAutoRenewalState).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'old-subscription' }),
      command.tx,
    );
  });

  it('propagates a renewal persistence failure without falling back to creating a subscription', async () => {
    const { useCase, repository, command } = fixture({
      type: PaymentType.RENEWAL,
      providerSubscriptionId: 'sub_old',
    });
    repository.findByUserId.mockResolvedValue([existing()]);
    const error = new Error('renewal update failed');
    repository.renewWithPaymentApplication.mockRejectedValue(error);

    await expect(useCase.execute(command)).rejects.toBe(error);
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });
});

function transferOperation(paymentId: string, subscriptionId: string): AutoRenewalOperation {
  return {
    id: 'operation-id',
    paymentId,
    userId: 42,
    type: AutoRenewalOperationType.TRANSFER,
    status: AutoRenewalOperationStatus.DISABLE_PENDING,
    subscriptionId,
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: null,
    sourceSubscriptionId: 'old-subscription',
    sourceProviderSubscriptionId: 'sub_old',
  };
}

function existing(overrides: Partial<SubscriptionForPayment> = {}): SubscriptionForPayment {
  return {
    subscriptionId: 'old-subscription',
    planId: 7,
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_old',
    startsAt: new Date('2026-09-01T00:00:00.000Z'),
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    status: SubscriptionStatus.EXPIRED,
    autoRenewalStatus: AutoRenewalStatus.DISABLED,
    ...overrides,
  };
}

function fixture(overrides: Partial<SuccessfulPayment> = {}) {
  const repository = {
    createAutoRenewalOperation: vi.fn<SubscriptionsRepository['createAutoRenewalOperation']>(),
    completeAutoRenewalOperation: vi.fn<SubscriptionsRepository['completeAutoRenewalOperation']>(),
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    confirmAutoRenewalCancellation: vi
      .fn<SubscriptionsRepository['confirmAutoRenewalCancellation']>(),
    bindProviderSubscription: vi.fn<SubscriptionsRepository['bindProviderSubscription']>(),
    findPaymentApplication: vi.fn<SubscriptionsRepository['findPaymentApplication']>().mockResolvedValue(null),
    findByUserId: vi.fn<SubscriptionsRepository['findByUserId']>().mockResolvedValue([]),
    markExpired: vi.fn<SubscriptionsRepository['markExpired']>().mockResolvedValue(),
    setAutoRenewalState: vi.fn<SubscriptionsRepository['setAutoRenewalState']>().mockResolvedValue(),
    renewWithPaymentApplication: vi
      .fn<SubscriptionsRepository['renewWithPaymentApplication']>()
      .mockResolvedValue(),
    createWithPaymentApplication: vi
      .fn<SubscriptionsRepository['createWithPaymentApplication']>()
      .mockResolvedValue(),
  };
  const payment: SuccessfulPayment = {
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: 42,
    planId: 7,
    type: PaymentType.PURCHASE,
    autoRenewalRequested: true,
    amount: 1000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    provider: PaymentProvider.STRIPE,
    providerCustomerId: 'cus_initial',
    providerSubscriptionId: 'sub_initial',
    paidAt: '2026-10-23T10:00:00.000Z',
    ...overrides,
  };
  return {
    repository,
    command: new ApplySuccessfulPaymentCommand(payment, {}),
    useCase: new ApplySuccessfulPaymentUseCase(repository),
  };
}
