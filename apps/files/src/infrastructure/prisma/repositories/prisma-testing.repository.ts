import { Injectable } from '@nestjs/common';
import { TestingRepository } from '../../../application/ports/testing.repository.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaTestingRepository implements TestingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteAllData(): Promise<void> {
    // SQL является константой и не содержит пользовательского ввода. У записей операций нет
    // внешнего ключа на files, поэтому обе таблицы перечислены явно; CASCADE охватит будущие зависимости.
    await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "image_upload_operation_receipts", "files" CASCADE');
  }
}
