import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../database/generated/client.js';
import { PrismaService } from '../../../../../database/prisma.service.js';
import {
  EmailAlreadyExistsError,
  UsernameAlreadyExistsError,
} from '../../../application/errors/users.errors.js';
import { UsersRepository } from '../../../application/ports/users.repository.js';
import type {
  ConfirmUserResult,
  CreateUserRepositoryParams,
  ReleaseExpiredRegistrationCredentialsParams,
  UpdateConfirmationCodeParams,
} from '../../../application/types/users.types.js';
import { User } from '../../../domain/entities/user.entity.js';
import { ConfirmationInfo } from '../../../domain/value-objects/confirmation-info.js';
import { UserPrismaMapper } from '../mappers/user-prisma.mapper.js';

type UniqueConstraintMeta = {
  driverAdapterError?: {
    cause?: {
      constraint?: {
        fields?: string[];
      };
    };
  };
};

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: {
        id: 'asc',
      },
    });

    return users.map((user) => UserPrismaMapper.toDomain(user));
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    return user ? UserPrismaMapper.toDomain(user) : null;
  }

  async isUsernameExists(username: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      select: { id: true },
      where: { username, deletedAt: null },
    });

    return user !== null;
  }

  async isEmailExists(email: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      select: { id: true },
      where: { email, deletedAt: null },
    });

    return user !== null;
  }

  async create(params: CreateUserRepositoryParams): Promise<User> {
    const { username, email, hash, createdAt, confirmation, passwordRecovery } = params;

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          email,
          hash,
          createdAt,
          isConfirmed: confirmation.isConfirmed,
          confirmationCode: confirmation.code,
          confirmationExpiration: confirmation.expiration,
          passwordRecoveryCode: passwordRecovery.code,
          passwordRecoveryExpiration: passwordRecovery.expiration,
        },
      });

      return UserPrismaMapper.toDomain(user);
    } catch (error) {
      // Предварительные проверки в UsersService не исключают конкурентную вставку. В таком случае
      // уникальный индекс отклоняет второй INSERT, а Prisma возвращает ошибку P2002.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      // PostgreSQL-адаптер Prisma передаёт в metadata поля нарушенного уникального индекса.
      // Преобразуем инфраструктурную ошибку в соответствующую прикладную ошибку пользователя.
      const meta = error.meta as UniqueConstraintMeta | undefined;
      const fields = meta?.driverAdapterError?.cause?.constraint?.fields ?? [];

      if (fields.includes('username')) {
        throw new UsernameAlreadyExistsError();
      }

      if (fields.includes('email')) {
        throw new EmailAlreadyExistsError();
      }

      // Неизвестное уникальное ограничение нельзя безопасно интерпретировать как username или email.
      throw error;
    }
  }

  async releaseExpiredRegistrationCredentials(
    params: ReleaseExpiredRegistrationCredentialsParams,
  ): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        deletedAt: null,
        isConfirmed: false,
        confirmationExpiration: { lte: params.now },
        OR: [{ username: params.username }, { email: params.email }],
      },
      data: { deletedAt: params.now },
    });
  }

  async getConfirmationInfo(code: string): Promise<ConfirmationInfo | null> {
    const user = await this.prisma.user.findFirst({
      select: {
        isConfirmed: true,
        confirmationCode: true,
        confirmationExpiration: true,
      },
      where: { confirmationCode: code, deletedAt: null },
    });

    if (!user) return null;

    return ConfirmationInfo.restore({
      isConfirmed: user.isConfirmed,
      code: user.confirmationCode,
      expiration: user.confirmationExpiration,
    });
  }

  async confirmUser(code: string): Promise<ConfirmUserResult> {
    const [result] = await this.prisma.$queryRaw<ConfirmUserResult[]>`
      WITH "confirmationAttempt" AS (
        UPDATE "users"
        SET
          "isConfirmed" = TRUE,
          "confirmationCode" = NULL,
          "confirmationExpiration" = NULL
        WHERE "confirmationCode" = ${code}
          AND "confirmationExpiration" > CURRENT_TIMESTAMP
          AND "isConfirmed" = FALSE
          AND "deletedAt" IS NULL
        RETURNING 1
      )
      SELECT
        EXISTS(SELECT 1 FROM "confirmationAttempt") AS "wasConfirmed",
        CURRENT_TIMESTAMP AS "checkedAt"
    `;

    if (!result) {
      throw new Error('Confirmation query returned no result');
    }

    return result;
  }

  /** Атомарно заменяет confirmation code, только пока в записи хранится ожидаемый предыдущий код. */
  async updateConfirmationCode(params: UpdateConfirmationCodeParams): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      data: {
        confirmationCode: params.newCode,
        confirmationExpiration: params.expiration,
      },
      where: {
        id: params.userId,
        confirmationCode: params.expectedCode,
        isConfirmed: false,
        deletedAt: null,
      },
    });

    return result.count > 0;
  }
}
