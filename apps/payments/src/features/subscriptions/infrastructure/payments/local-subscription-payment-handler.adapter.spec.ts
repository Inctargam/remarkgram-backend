import type { CommandBus } from '@nestjs/cqrs';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmAutoRenewalCancellationCommand } from '../../application/use-cases/confirm-auto-renewal-cancellation/confirm-auto-renewal-cancellation.use-case.js';
import { BindProviderSubscriptionCommand } from '../../application/use-cases/bind-provider-subscription/bind-provider-subscription.use-case.js';
import { LocalSubscriptionPaymentHandlerAdapter } from './local-subscription-payment-handler.adapter.js';

describe('LocalSubscriptionPaymentHandlerAdapter: provider cancellation', () => {
  it('dispatches the incoming identities and the same transaction through CommandBus', async () => {
    const commandBus = { execute: vi.fn().mockResolvedValue(undefined) };
    const adapter = new LocalSubscriptionPaymentHandlerAdapter(commandBus as unknown as CommandBus);
    const tx = {};

    await expect(
      adapter.confirmAutoRenewalCancellation('payment-id', 'sub_old', tx),
    ).resolves.toBeUndefined();

    expect(commandBus.execute).toHaveBeenCalledExactlyOnceWith(
      new ConfirmAutoRenewalCancellationCommand('payment-id', 'sub_old', tx),
    );
    const [command] = commandBus.execute.mock.calls[0] as [ConfirmAutoRenewalCancellationCommand];
    expect(command.tx).toBe(tx);
  });

  it('propagates the command failure to D1', async () => {
    const error = new Error('cancellation conflict');
    const commandBus = { execute: vi.fn().mockRejectedValue(error) };
    const adapter = new LocalSubscriptionPaymentHandlerAdapter(commandBus as unknown as CommandBus);

    await expect(
      adapter.confirmAutoRenewalCancellation('payment-id', 'sub_old', {}),
    ).rejects.toBe(error);
  });
});

describe('LocalSubscriptionPaymentHandlerAdapter: provider binding', () => {
  it('dispatches the binding command with the same transaction', async () => {
    const commandBus = { execute: vi.fn().mockResolvedValue(undefined) };
    const adapter = new LocalSubscriptionPaymentHandlerAdapter(commandBus as unknown as CommandBus);
    const tx = {};

    await expect(adapter.bindProviderSubscription('payment-id', 'sub_new', tx)).resolves.toBeUndefined();

    expect(commandBus.execute).toHaveBeenCalledExactlyOnceWith(
      new BindProviderSubscriptionCommand('payment-id', 'sub_new', tx),
    );
    const [command] = commandBus.execute.mock.calls[0] as [BindProviderSubscriptionCommand];
    expect(command.tx).toBe(tx);
  });

  it('propagates a binding failure to the D1 transaction', async () => {
    const error = new Error('binding conflict');
    const commandBus = { execute: vi.fn().mockRejectedValue(error) };
    const adapter = new LocalSubscriptionPaymentHandlerAdapter(commandBus as unknown as CommandBus);

    await expect(adapter.bindProviderSubscription('payment-id', 'sub_new', {})).rejects.toBe(error);
  });
});
