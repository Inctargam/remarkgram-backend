import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PostsDbosDataSource extends PrismaDataSource<PrismaService> {
  constructor(prisma: PrismaService) {
    super('posts-prisma', prisma);
  }
}
