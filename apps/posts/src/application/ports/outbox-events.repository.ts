import type { IntegrationEvent } from '@app/message-broker';
import type { TransactionContext } from '../../../../user-accounts/src/common/application/unit-of-work.js';

export abstract class OutboxEventsRepository {
  abstract add(event: IntegrationEvent, ctx?: TransactionContext): Promise<void>;
}
