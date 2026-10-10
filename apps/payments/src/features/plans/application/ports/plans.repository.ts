import type { PersistedPlan } from '../../domain/plan.entity.js';
import type { FindPlanByIdRepositoryParams, FindPlanByIdRepositoryResult } from '../types/plans.types.js';

export abstract class PlansRepository {
  abstract findById(params: FindPlanByIdRepositoryParams): Promise<FindPlanByIdRepositoryResult>;
  abstract getByIdOrThrow(id: number): Promise<PersistedPlan>;
}
