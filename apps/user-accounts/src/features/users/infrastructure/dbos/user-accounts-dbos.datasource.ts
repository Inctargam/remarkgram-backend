import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';

@Injectable()
export class UserAccountsDbosDataSource extends PrismaDataSource<PrismaService> {
  constructor(prisma: PrismaService) {
    super('user-accounts-prisma', prisma);
  }
}
