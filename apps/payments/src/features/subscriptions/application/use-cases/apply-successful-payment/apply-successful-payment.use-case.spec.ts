import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency } from '../../../../../common/domain/currency.enum.js';
import { PeriodUnit } from '../../../../../common/domain/period-unit.enum.js';
import { PaymentProvider, PaymentType } from '../../../../payments/domain/payment.entity.js';
import type { SuccessfulPayment } from '../../../../payments/application/types/successful-payment.types.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type { SubscriptionForPayment } from '../../types/subscriptions.types.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionPaymentProcessingStatus } from '../../../domain/enums/subscription-payment-processing-status.enum.js';
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
        autoRenewalChangeId: null,
        previousSubscriptionId: null,
        result,
        processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
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
      previousSubscriptionId: null,
      processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
      boundProviderSubscriptionId: null,
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
          processingStatus: SubscriptionPaymentProcessingStatus.CANCELLATION_PENDING,
          startsAt: new Date('2026-11-25T00:00:00.000Z'),
          status: SubscriptionStatus.PENDING,
          previousSubscriptionId: 'old-subscription',
          providerSubscriptionId: null,
          autoRenewalStatus: AutoRenewalStatus.ENABLING,
          autoRenewalChangeId: command.payment.paymentId,
        }),
        command.tx,
      );
      expect(repository.setAutoRenewalState).toHaveBeenCalledWith(
        {
          subscriptionId: 'old-subscription',
          status: AutoRenewalStatus.DISABLING,
          changeId: command.payment.paymentId,
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

  it('rejects a late payment that would overlap a historical paid period', async () => {
    const { useCase, repository, command } = fixture({ paidAt: '2026-09-15T10:00:00.000Z' });
    repository.findByUserId.mockResolvedValue([existing()]);

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'SUBSCRIPTION_PERIOD_OVERLAP' });
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
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

  it('does not report auto-renewal enabled without a provider subscription', async () => {
    const { useCase, repository, command } = fixture({ providerSubscriptionId: null });
    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'PROVIDER_SUBSCRIPTION_MISSING' });
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });

  it('schedules retirement of an expired subscription whose auto-renewal is still enabled', async () => {
    const { useCase, repository, command } = fixture();
    repository.findByUserId.mockResolvedValue([existing({ autoRenewalStatus: AutoRenewalStatus.ENABLED })]);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      action: 'SCHEDULED',
      previousProviderSubscriptionId: 'sub_old',
    });
    expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
      expect.objectContaining({ startsAt: new Date(command.payment.paidAt) }),
      command.tx,
    );
  });

  it.each([null, 'sub_initial'])(
    'creates a period without enabling auto-renewal with provider subscription %s',
    async (providerSubscriptionId) => {
      const { useCase, repository, command } = fixture({
        autoRenewalRequested: false,
        providerSubscriptionId,
      });
      await useCase.execute(command);
      expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
        expect.objectContaining({ providerSubscriptionId, autoRenewalStatus: AutoRenewalStatus.DISABLED }),
        command.tx,
      );
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
        previousSubscriptionId: 'pending-subscription',
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
        previousSubscriptionId: action === 'SCHEDULED' ? 'old-subscription' : null,
        processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
        boundProviderSubscriptionId: action === 'SCHEDULED' ? 'sub_bound' : null,
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
    SubscriptionPaymentProcessingStatus.CANCELLATION_PENDING,
    SubscriptionPaymentProcessingStatus.BINDING_PENDING,
  ])('replays a scheduled result during %s without restarting the transition', async (processingStatus) => {
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
      previousSubscriptionId: 'old-subscription',
      processingStatus,
      boundProviderSubscriptionId: null,
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
      reason: 'SCHEDULED_AUTO_RENEWAL_REQUIRED',
    });
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });

  it('does not schedule provider cancellation without the previous provider binding', async () => {
    const { useCase, repository, command } = fixture();
    repository.findByUserId.mockResolvedValue([
      existing({ providerSubscriptionId: null, expiresAt: new Date('2026-11-01T00:00:00.000Z') }),
    ]);

    await expect(useCase.execute(command)).rejects.toMatchObject({
      reason: 'PREVIOUS_PROVIDER_SUBSCRIPTION_MISSING',
    });
    expect(repository.createWithPaymentApplication).not.toHaveBeenCalled();
  });

  it.each([AutoRenewalStatus.ENABLED, AutoRenewalStatus.DISABLED, AutoRenewalStatus.RETIRED])(
    'applies a late renewal to its provider binding without changing %s auto-renewal',
    async (autoRenewalStatus) => {
      const { useCase, repository, command } = fixture({
        type: PaymentType.RENEWAL,
        autoRenewalRequested: null,
        providerSubscriptionId: 'sub_old',
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
          result,
          processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
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

  it('rejects a late renewal that would overlap an already purchased future period', async () => {
    const { useCase, repository, command } = fixture({
      type: PaymentType.RENEWAL,
      providerSubscriptionId: 'sub_old',
    });
    repository.findByUserId.mockResolvedValue([
      existing({ expiresAt: new Date('2026-11-01T00:00:00.000Z') }),
      existing({
        subscriptionId: 'pending-subscription',
        providerSubscriptionId: 'sub_pending',
        startsAt: new Date('2026-11-01T00:00:00.000Z'),
        expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        status: SubscriptionStatus.PENDING,
      }),
    ]);

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'SUBSCRIPTION_PERIOD_OVERLAP' });
    expect(repository.renewWithPaymentApplication).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-01-31T10:00:00.000Z', PeriodUnit.MONTH, 1, '2026-02-28T10:00:00.000Z'],
    ['2024-01-31T10:00:00.000Z', PeriodUnit.MONTH, 1, '2024-02-29T10:00:00.000Z'],
    ['2026-01-31T10:00:00.000Z', PeriodUnit.MONTH, 2, '2026-03-31T10:00:00.000Z'],
    ['2026-10-23T10:00:00.000Z', PeriodUnit.DAY, 2, '2026-10-25T10:00:00.000Z'],
    ['2026-10-23T10:00:00.000Z', PeriodUnit.WEEK, 2, '2026-11-06T10:00:00.000Z'],
  ] as const)('calculates %s + %s × %s', async (paidAt, periodUnit, periodCount, expectedEnd) => {
    const { useCase, command } = fixture({ paidAt, periodUnit, periodCount });
    await expect(useCase.execute(command)).resolves.toMatchObject({ nextSubscriptionStartsAt: expectedEnd });
  });

  it('records an already elapsed period as EXPIRED instead of granting access from processing time', async () => {
    const { useCase, repository, command } = fixture({ paidAt: '2026-01-01T10:00:00.000Z' });
    await useCase.execute(command);
    expect(repository.createWithPaymentApplication).toHaveBeenCalledWith(
      expect.objectContaining({ status: SubscriptionStatus.EXPIRED, startsAt: new Date(command.payment.paidAt) }),
      command.tx,
    );
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
    findCancellationApplications: vi.fn<SubscriptionsRepository['findCancellationApplications']>(),
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    completeProviderSubscriptionCancellation: vi
      .fn<SubscriptionsRepository['completeProviderSubscriptionCancellation']>(),
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
    targetSubscriptionId: null,
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
