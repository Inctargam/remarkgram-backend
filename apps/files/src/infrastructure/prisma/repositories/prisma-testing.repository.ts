import { Injectable } from '@nestjs/common';
import { TestingRepository } from '../../../application/ports/testing.repository.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaTestingRepository implements TestingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteAllData(): Promise<void> {
    // SQL is constant and contains no user input. CASCADE also clears future tables that may
    // reference files, while keeping the cleanup endpoint independent of the Prisma model list.
    await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "files", "image_upload_reservations" CASCADE');
    await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "inbox_events" CASCADE');
    await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "file_deletion_jobs" CASCADE');
  }
}
