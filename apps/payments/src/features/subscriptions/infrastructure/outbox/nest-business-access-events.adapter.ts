import {
  BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
  type BusinessAccessChangedV1Event,
} from '@app/message-broker';
import { Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import type { Prisma } from '../../../../database/prisma/generated/client.js';
import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';
import { BusinessAccessEvents } from '../../application/ports/business-access-events.js';

@Injectable()
export class NestBusinessAccessEventsAdapter extends BusinessAccessEvents {
  constructor(private readonly outbox: Outbox<Prisma.TransactionClient>) {
    super();
  }

  async addSnapshot(
    userId: number,
    hasBusinessAccess: boolean,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    // Вызывающий код держит lockByUserId: версии одного пользователя следуют порядку его транзакций.
    const [row] = await client.$queryRaw<{ version: bigint }[]>`
      SELECT nextval('business_access_event_version_seq') AS version
    `;
    const payload: BusinessAccessChangedV1Event['data'] = {
      userId,
      hasBusinessAccess,
      version: row.version.toString(),
    };

    await this.outbox.add(client, {
      topic: BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
      key: `business-access:${userId}`,
      payload,
    });
    // Commit выполняет вызывающий код; relay увидит запись после commit на ближайшем poll.
  }
}
