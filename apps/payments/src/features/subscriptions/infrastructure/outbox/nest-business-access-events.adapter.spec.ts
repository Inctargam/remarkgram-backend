import { BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME, type BusinessAccessChangedV1Event } from '@app/message-broker';
import type { NewOutboxMessage, Outbox } from '@nestjs/outbox';
import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../../database/prisma/generated/client.js';
import { NestBusinessAccessEventsAdapter } from './nest-business-access-events.adapter.js';

describe('NestBusinessAccessEventsAdapter', () => {
  it('keeps the transaction and an exact bigint version in the outbox snapshot', async () => {
    const { adapter, outbox, tx } = fixture();
    tx.$queryRaw.mockResolvedValue([{ version: 9007199254740993n }]);

    await adapter.addSnapshot(42, true, tx);

    expect(tx.$queryRaw).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining([expect.stringContaining("nextval('business_access_event_version_seq')")]),
    );
    expect(outbox.add).toHaveBeenCalledExactlyOnceWith(tx, {
      topic: BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
      key: 'business-access:42',
      payload: { userId: 42, hasBusinessAccess: true, version: '9007199254740993' },
    });
  });

  it('preserves later versions and does not derive their order from the access value', async () => {
    const { adapter, outbox, tx } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ version: 10n }]).mockResolvedValueOnce([{ version: 12n }]);

    await adapter.addSnapshot(42, true, tx);
    await adapter.addSnapshot(42, false, tx);

    expect(outbox.add.mock.calls.map(([, message]) => message.payload)).toEqual([
      { userId: 42, hasBusinessAccess: true, version: '10' },
      { userId: 42, hasBusinessAccess: false, version: '12' },
    ]);
  });

  it('propagates an outbox write error so the caller rolls back its subscription changes', async () => {
    const { adapter, outbox, tx } = fixture();
    const error = new Error('outbox insert failed');
    outbox.add.mockRejectedValue(error);

    await expect(adapter.addSnapshot(42, false, tx)).rejects.toBe(error);
  });

  it('does not enqueue when allocating a version fails', async () => {
    const { adapter, outbox, tx } = fixture();
    const error = new Error('sequence unavailable');
    tx.$queryRaw.mockRejectedValue(error);

    await expect(adapter.addSnapshot(42, true, tx)).rejects.toBe(error);
    expect(outbox.add).not.toHaveBeenCalled();
  });
});

function fixture() {
  const tx = {
    $queryRaw: vi.fn<(query: TemplateStringsArray) => Promise<{ version: bigint }[]>>()
      .mockResolvedValue([{ version: 1n }]),
  };
  const outbox = {
    add: vi.fn<(
      tx: Prisma.TransactionClient,
      message: NewOutboxMessage<BusinessAccessChangedV1Event['data']>,
    ) => Promise<void>>().mockResolvedValue(),
  };
  const adapter = new NestBusinessAccessEventsAdapter(outbox as unknown as Outbox<Prisma.TransactionClient>);
  return { adapter, outbox, tx };
}
