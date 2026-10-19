import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../database/generated/client.js';
import type { TransactionContext } from '../../../../../common/application/unit-of-work.js';
import { AvatarDeletionRequestsRepository } from '../../../application/ports/avatar-deletion-requests.repository.js';
import type { DeleteAvatarParams } from '../../../application/types/users.types.js';

@Injectable()
export class PrismaAvatarDeletionRequestsRepository implements AvatarDeletionRequestsRepository {
  async exists(params: DeleteAvatarParams, ctx: TransactionContext): Promise<boolean> {
    const request = await (ctx as Prisma.TransactionClient).avatarDeletionRequest.findFirst({
      where: {
        userId: params.userId,
        idempotencyKey: params.idempotencyKey,
      },
      select: { userId: true },
    });
    return request !== null;
  }

  async add(params: DeleteAvatarParams, ctx: TransactionContext): Promise<void> {
    await (ctx as Prisma.TransactionClient).avatarDeletionRequest.create({ data: params });
  }
}
