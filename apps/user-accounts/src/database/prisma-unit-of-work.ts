import { Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  type TransactionContext,
  type TransactionOptions,
} from '../common/application/unit-of-work.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Запускает callback внутри интерактивной Prisma-транзакции. */
  run<T>(handler: (ctx: TransactionContext) => Promise<T>, options?: TransactionOptions): Promise<T> {
    return this.prisma.$transaction((tx) => handler(tx), options);
  }
}
