import type { PersistedPlan } from '../../domain/plan.entity.js';

export type FindPlanByIdRepositoryParams = {
  id: number;
};

export type FindPlanByIdRepositoryResult = PersistedPlan | null;
