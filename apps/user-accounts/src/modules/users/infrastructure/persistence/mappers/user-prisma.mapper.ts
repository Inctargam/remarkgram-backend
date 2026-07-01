import type { User as PrismaUser } from '../../../../../database/generated/client.js';
import { User } from '../../../domain/entities/user.entity.js';

export class UserPrismaMapper {
  static toDomain(row: PrismaUser): User {
    return User.restore({
      id: row.id,
      username: row.username,
      email: row.email,
      hash: row.hash,
      createdAt: row.createdAt,
      confirmation: {
        isConfirmed: row.isConfirmed,
        code: row.confirmationCode,
        expiration: row.confirmationExpiration,
      },
      passwordRecovery: {
        code: row.passwordRecoveryCode,
        expiration: row.passwordRecoveryExpiration,
      },
      deletedAt: row.deletedAt,
    });
  }
}
