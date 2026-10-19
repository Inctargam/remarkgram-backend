import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { PaymentsQueryRepository, type PaymentListItemView } from '../../ports/payments.query-repository.js';

export type GetPaymentsResult = {
  items: PaymentListItemView[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  pagesCount: number;
};

export class GetPaymentsQuery extends Query<GetPaymentsResult> {
  constructor(
    readonly userId: number,
    readonly pageNumber: number,
    readonly pageSize: number,
  ) {
    super();
  }
}

@QueryHandler(GetPaymentsQuery)
export class GetPaymentsQueryHandler implements IQueryHandler<GetPaymentsQuery, GetPaymentsResult> {
  constructor(private readonly paymentsQueryRepository: PaymentsQueryRepository) {}

  async execute(query: GetPaymentsQuery): Promise<GetPaymentsResult> {
    const page = await this.paymentsQueryRepository.findUserPaymentsPage(query);
    return {
      items: page.items,
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      totalCount: page.totalCount,
      pagesCount: Math.ceil(page.totalCount / query.pageSize),
    };
  }
}
