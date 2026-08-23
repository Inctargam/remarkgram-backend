import { Injectable } from '@nestjs/common';
import { TestingRepository } from '../../../application/ports/testing.repository.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaTestingRepository implements TestingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteAllData(): Promise<void> {
    // SQL is constant and contains no user input. CASCADE clears post_images, and
    // RESTART IDENTITY makes generated post ids deterministic between test runs.
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "post_creation_operations", "posts" RESTART IDENTITY CASCADE',
    );
  }
}
