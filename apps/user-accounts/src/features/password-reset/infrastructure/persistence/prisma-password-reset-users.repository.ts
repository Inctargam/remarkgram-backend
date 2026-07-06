import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';
import type { Prisma } from '../../../../database/generated/client.js';
import { PasswordResetUsersRepository } from '../../application/ports/password-reset-users.repository.js';
import type { PasswordResetUser } from '../../application/types/password-reset.types.js';

type PasswordResetUsersPrismaClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PrismaPasswordResetUsersRepository extends PasswordResetUsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Возвращает транзакционный Prisma client, если он передан, иначе основной PrismaService. */
  getClient(ctx?: Prisma.TransactionClient): PasswordResetUsersPrismaClient {
    return ctx ?? this.prisma;
  }

  /** Ищет подтверждённого и не удалённого пользователя по email для сценария сброса пароля. */
  async findByConfirmedEmail(
    email: string,
    ctx?: Prisma.TransactionClient,
  ): Promise<PasswordResetUser | null> {
    const client = this.getClient(ctx);
    const user = await client.user.findFirst({
      select: {
        id: true,
        email: true,
      },
      where: {
        email,
        isConfirmed: true,
        deletedAt: null,
      },
    });

    return user;
  }

  /** Обновляет хеш пароля пользователя и фиксирует время смены пароля. */
  async updatePasswordHash(
    userId: number,
    passwordHash: string,
    ctx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = this.getClient(ctx);
    const result = await client.user.updateMany({
      data: {
        hash: passwordHash,
        passwordChangedAt: new Date(),
      },
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    return result.count === 1;
  }
}
