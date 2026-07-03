import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service.js';
import { UsersRepository } from '../../../application/ports/users.repository.js';
import type {
  CreateUserRepositoryParams,
  UpdateConfirmationCodeParams,
} from '../../../application/types/users.types.js';
import { User } from '../../../domain/entities/user.entity.js';
import { UserPrismaMapper } from '../mappers/user-prisma.mapper.js';

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
  }

  async getConfirmationInfo(code: string) {
    const user = await this.prisma.user.findFirst({
      select: {
        isConfirmed: true,
        confirmationCode: true,
        confirmationExpiration: true,
      },
      where: { confirmationCode: code, deletedAt: null },
    });

    if (!user) return null;

    return {
      isConfirmed: user.isConfirmed,
      code: user.confirmationCode,
      expiration: user.confirmationExpiration,
    };
  }

  async confirmUser(code: string): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      data: {
        isConfirmed: true,
        confirmationExpiration: null,
      },
      where: { confirmationCode: code, deletedAt: null },
    });

    return result.count > 0;
  }

  async updateConfirmationCode(params: UpdateConfirmationCodeParams): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      data: {
        confirmationCode: params.code,
        confirmationExpiration: params.expiration,
      },
      where: { email: params.email, deletedAt: null },
    });

    return result.count > 0;
  }
}
