import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { PlanNotFoundError } from '../application/errors/plan.errors.js';
import { PlansRepository } from '../application/ports/plans.repository.js';
import type {
  FindPlanByIdRepositoryParams,
  FindPlanByIdRepositoryResult,
} from '../application/types/plans.types.js';
import type { PersistedPlan } from '../domain/plan.entity.ts';
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
  async getByIdOrThrow(id: number): Promise<PersistedPlan> {
    const row = await this.prisma.plan.findUnique({
      where: { id: id },
    });
    if (!row) {
      throw new PlanNotFoundError(id);
    }
    return PlanPrismaMapper.toDomain(row);
  }
}
