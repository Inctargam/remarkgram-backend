import type { FindPlanByIdRepositoryParams, FindPlanByIdRepositoryResult } from '../types/plans.types.js';

export abstract class PlansRepository {
  abstract findById(params: FindPlanByIdRepositoryParams): Promise<FindPlanByIdRepositoryResult>;
}
