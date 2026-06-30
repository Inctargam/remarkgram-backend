import type { User as PrismaUser } from '../../../../../database/prisma/generated/client.js';
import { User } from '../../../domain/entities/user.entity.js';

export class UserPrismaMapper {
  static toDomain(row: PrismaUser): User {
    return User.restore({
      id: row.id,
      email: row.email,
      name: row.name,
    });
  }
}
