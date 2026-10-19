import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { PlansQueryRepository, type PlanView } from '../../ports/plans.query-repository.js';

export class GetPlansQuery extends Query<PlanView[]> {}

@QueryHandler(GetPlansQuery)
export class GetPlansQueryHandler implements IQueryHandler<GetPlansQuery, PlanView[]> {
  constructor(private readonly plansQueryRepository: PlansQueryRepository) {}

  execute(): Promise<PlanView[]> {
    return this.plansQueryRepository.findAll();
  }
}
