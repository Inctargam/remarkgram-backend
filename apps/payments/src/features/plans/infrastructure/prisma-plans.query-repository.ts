import { Injectable } from '@nestjs/common';
import { PlansQueryRepository, type PlanView } from '../application/ports/plans.query-repository.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class PrismaPlansQueryRepository implements PlansQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PlanView[]> {
    return this.prisma.plan.findMany({
      select: {
        id: true,
        price: true,
        currency: true,
        periodCount: true,
        periodUnit: true,
      },
      orderBy: { id: 'asc' },
    });
  }
}
