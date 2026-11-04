import { describe, expect, it, vi } from 'vitest';
import {
  ChangeSubscriptionAutoRenewalCommand,
  ChangeSubscriptionAutoRenewalUseCase,
} from './change-subscription-auto-renewal.use-case.js';
import type { ChangeSubscriptionAutoRenewalParams } from '../../types/subscription-auto-renewal.types.js';

const subscriptionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idempotencyKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ChangeSubscriptionAutoRenewalUseCase', () => {
  it.each([true, false])('starts the shared workflow for enabled=%s', async (enabled) => {
    const result = { operationId: 'operation', subscriptionId, autoRenewalEnabled: enabled };
    const workflow = { execute: vi.fn().mockResolvedValue(result) };
    const params = {
      userId: 42,
      subscriptionId: subscriptionId.toUpperCase(),
      idempotencyKey: idempotencyKey.toUpperCase(),
      autoRenewalEnabled: enabled,
    };
    const pending = new ChangeSubscriptionAutoRenewalUseCase(workflow).execute(
      new ChangeSubscriptionAutoRenewalCommand(params),
    );
    await expect(pending).resolves.toEqual(result);
    expect(workflow.execute).toHaveBeenCalledExactlyOnceWith({
      workflowId: `subscription-auto-renewal:42:${idempotencyKey}`,
      userId: 42,
      subscriptionId,
      autoRenewalEnabled: enabled,
    });
  });

  it.each([undefined, null, 'false', 1])('rejects a non-boolean setting: %s', (autoRenewalEnabled) => {
    const workflow = { execute: vi.fn() };
    const params = { userId: 42, subscriptionId, idempotencyKey, autoRenewalEnabled };
    const command = new ChangeSubscriptionAutoRenewalCommand(
      params as unknown as ChangeSubscriptionAutoRenewalParams,
    );

    expect(() => new ChangeSubscriptionAutoRenewalUseCase(workflow).execute(command)).toThrow();
    expect(workflow.execute).not.toHaveBeenCalled();
  });

  it.each([
    { userId: 0 },
    { userId: 1.5 },
    { subscriptionId: 'invalid' },
    { idempotencyKey: 'invalid' },
  ])('rejects invalid arguments before starting the workflow: %j', (invalid) => {
    const workflow = { execute: vi.fn() };
    const command = new ChangeSubscriptionAutoRenewalCommand({
      userId: 42,
      subscriptionId,
      idempotencyKey,
      autoRenewalEnabled: true,
      ...invalid,
    });
    expect(() => new ChangeSubscriptionAutoRenewalUseCase(workflow).execute(command)).toThrow();
    expect(workflow.execute).not.toHaveBeenCalled();
  });
});
