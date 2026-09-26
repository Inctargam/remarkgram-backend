import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';
import { TestingRepository } from '../../application/ports/testing.repository.js';

@Injectable()
export class PrismaTestingRepository implements TestingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteAllData(): Promise<void> {
    // SQL is constant and contains no user input. CASCADE clears every table referencing users,
    // while RESTART IDENTITY resets the numeric user id sequence for repeatable tests.
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "users", "avatar_deletion_requests", "outbox_events" RESTART IDENTITY CASCADE',
    );
  }
}
