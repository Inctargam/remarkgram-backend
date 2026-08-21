import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service.js';
import type { CurrentUserView } from '../../../application/types/users.types.js';
import { UsersQueryRepository } from '../../../application/ports/users-query.repository.js';

@Injectable()
export class PrismaUsersQueryRepository implements UsersQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentById(userId: number): Promise<CurrentUserView | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        isConfirmed: true,
        hash: true,
        createdAt: true,
        providers: {
          select: { provider: true },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.isConfirmed,
      hasPassword: user.hash !== null,
      oauthProviders: user.providers.map(({ provider }) => provider),
      createdAt: user.createdAt,
    };
  }
}
