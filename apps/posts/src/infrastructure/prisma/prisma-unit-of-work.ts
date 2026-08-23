import { Injectable } from '@nestjs/common';
import { UnitOfWork, type TransactionContext } from '../../application/ports/unit-of-work.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(handler: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => handler(tx));
  }
}
