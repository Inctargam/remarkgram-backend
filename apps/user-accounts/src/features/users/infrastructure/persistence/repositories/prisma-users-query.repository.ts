import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service.js';
import type {
  CurrentUserView,
  MyProfileView,
  PublicUserProfileView,
} from '../../../application/types/users.types.js';
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
  async findPublicProfileByUserId(userId: number): Promise<PublicUserProfileView | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        profile: true,
      },
    });
    if (!user) return null;

    return {
      userId: user.id,
      username: user.username,
      aboutMe: user.profile?.aboutMe ?? null,
      avatarFileId: user.profile?.avatarFileId ?? null,
    };
  }

  async findMyProfileByUserId(userId: number): Promise<MyProfileView | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        profile: true,
      },
    });
    if (!user) return null;
    return {
      userId: user.id,
      username: user.username,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      aboutMe: user.profile?.aboutMe ?? null,
      avatarFileId: user.profile?.avatarFileId ?? null,
      city: user.profile?.city ?? null,
      countryCode: user.profile?.countryCode ?? null,
      dateOfBirth: user.profile?.dateOfBirth ? user.profile.dateOfBirth.toISOString().slice(0, 10) : null,
    };
  }
}
