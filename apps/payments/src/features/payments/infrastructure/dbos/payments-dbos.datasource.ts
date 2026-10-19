import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';

@Injectable()
export class PaymentsDbosDataSource extends PrismaDataSource<PrismaService> {
  constructor(prisma: PrismaService) {
    super('payments-prisma', prisma);
  }
}
