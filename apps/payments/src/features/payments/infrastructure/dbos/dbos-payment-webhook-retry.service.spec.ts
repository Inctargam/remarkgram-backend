import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbosMock = vi.hoisted(() => ({ sleepSeconds: vi.fn() }));
vi.mock('@dbos-inc/dbos-sdk', () => ({ DBOS: dbosMock }));

import {
  DbosPaymentWebhookRetryService,
  PaymentWebhookRetryError,
} from './dbos-payment-webhook-retry.service.js';

const retry = { maxAttempts: 3, initialDelaySeconds: 2, backoffRate: 2 };

describe('DbosPaymentWebhookRetryService', () => {
  const service = new DbosPaymentWebhookRetryService();

  beforeEach(() => vi.clearAllMocks());

  it('returns a successful result without consulting error policy or sleeping', async () => {
    const shouldRetry = vi.fn();
    await expect(
      service.run(async () => 'done', {
        operation: 'test',
        retry,
        shouldRetry,
      }),
    ).resolves.toBe('done');
    expect(shouldRetry).not.toHaveBeenCalled();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('uses the supplied decision and notifies the caller before each durable delay', async () => {
    const error = new Error('temporary');
    const action = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue('done');
    let notifications = 0;
    const onRetry = vi.fn(async () => {
      expect(dbosMock.sleepSeconds).toHaveBeenCalledTimes(notifications);
      notifications += 1;
    });

    await expect(
      service.run(action, {
        operation: 'test',
        retry,
        shouldRetry: () => true,
        onRetry,
      }),
    ).resolves.toBe('done');
    expect(action.mock.calls).toEqual([[1], [2], [3]]);
    expect(onRetry.mock.calls).toEqual([
      [{ error, attempt: 1, delaySeconds: 2 }],
      [{ error, attempt: 2, delaySeconds: 4 }],
    ]);
    expect(dbosMock.sleepSeconds.mock.calls).toEqual([[2], [4]]);
  });

  it('raises a rejected operation to the caller immediately when retries are disallowed', async () => {
    const cause = new Error('permanent');
    const action = vi.fn().mockRejectedValue(cause);
    await expect(
      service.run(action, {
        operation: 'test',
        retry,
        shouldRetry: () => false,
      }),
    ).rejects.toMatchObject({
      name: 'PaymentWebhookRetryError',
      operation: 'test',
      attempt: 1,
      retriesExhausted: false,
      cause,
    });
    expect(action).toHaveBeenCalledOnce();
    expect(dbosMock.sleepSeconds).not.toHaveBeenCalled();
  });

  it('raises exhaustion metadata and the last cause without performing a final delay', async () => {
    const cause = new Error('temporary');
    const action = vi.fn().mockRejectedValue(cause);
    const result = service.run(action, {
      operation: 'test',
      retry,
      shouldRetry: () => true,
    });
    await expect(result).rejects.toBeInstanceOf(PaymentWebhookRetryError);
    await expect(result).rejects.toMatchObject({
      operation: 'test',
      attempt: 3,
      retriesExhausted: true,
      cause,
    });
    expect(action).toHaveBeenCalledTimes(3);
    expect(dbosMock.sleepSeconds.mock.calls).toEqual([[2], [4]]);
  });
});
