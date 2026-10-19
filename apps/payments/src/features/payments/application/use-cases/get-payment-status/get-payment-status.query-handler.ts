import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { PaymentNotFoundError } from '../../../../../common/application/errors/payments.error.js';
import { PaymentsQueryRepository, type PaymentStatusView } from '../../ports/payments.query-repository.js';

export class GetPaymentStatusQuery extends Query<PaymentStatusView> {
  constructor(
    readonly paymentId: string,
    readonly userId: number,
  ) {
    super();
  }
}

@QueryHandler(GetPaymentStatusQuery)
export class GetPaymentStatusQueryHandler implements IQueryHandler<GetPaymentStatusQuery, PaymentStatusView> {
  constructor(private readonly paymentsQueryRepository: PaymentsQueryRepository) {}

  async execute(query: GetPaymentStatusQuery): Promise<PaymentStatusView> {
    const payment = await this.paymentsQueryRepository.findStatusByUserAndId(query.userId, query.paymentId);
    if (!payment) throw new PaymentNotFoundError(query.paymentId);
    return payment;
  }
}
