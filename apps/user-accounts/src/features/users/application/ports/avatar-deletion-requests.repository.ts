import type { TransactionContext } from '../../../../common/application/unit-of-work.js';
import type { DeleteAvatarParams } from '../types/users.types.js';

export abstract class AvatarDeletionRequestsRepository {
  abstract exists(params: DeleteAvatarParams, ctx: TransactionContext): Promise<boolean>;
  abstract add(params: DeleteAvatarParams, ctx: TransactionContext): Promise<void>;
}
