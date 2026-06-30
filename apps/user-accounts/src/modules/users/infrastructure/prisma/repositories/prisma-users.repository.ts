import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma/prisma.service.js';
import { UsersRepository } from '../../../application/ports/users.repository.js';
import { User } from '../../../domain/entities/user.entity.js';
import { UserPrismaMapper } from '../mappers/user-prisma.mapper.js';

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      orderBy: {
        id: 'asc',
      },
    });

    return users.map((user) => UserPrismaMapper.toDomain(user));
  }
}
