import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { PlansRepository } from '../application/ports/plans.repository.js';
import type {
  FindPlanByIdRepositoryParams,
  FindPlanByIdRepositoryResult,
} from '../application/types/plans.types.js';
import { PlanPrismaMapper } from './plan-prisma.mapper.js';

@Injectable()
export class PrismaPlansRepository implements PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(params: FindPlanByIdRepositoryParams): Promise<FindPlanByIdRepositoryResult> {
    const row = await this.prisma.plan.findUnique({
      where: { id: params.id },
    });

    return row ? PlanPrismaMapper.toDomain(row) : null;
  }
}
