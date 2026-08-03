import { Injectable } from '@nestjs/common';
import { FilesRepository, type CreateFileRecord } from '../../../application/ports/files.repository.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaFilesRepository extends FilesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createMany(fileRecords: readonly CreateFileRecord[]): Promise<void> {
    await this.prisma.file.createMany({
      data: [...fileRecords],
    });
  }
}
