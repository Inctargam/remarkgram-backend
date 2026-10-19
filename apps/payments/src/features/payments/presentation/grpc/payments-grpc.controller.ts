import {
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
  type GetPaymentsRequest,
  type GetPaymentsResponse,
  type GetPaymentStatusRequest,
  type GetPaymentStatusResponse,
  type GetPlansRequest,
  type GetPlansResponse,
  PaymentsServiceControllerMethods,
} from '@app/payments-grpc';
import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { PaymentsRpcExceptionFilter } from '../../../../common/grpc/payments-rpc-exception.filter.js';
import { CreateCheckoutCommand } from '../../application/use-cases/create-checkout.use-case.js';
import { GetPaymentsQuery } from '../../application/use-cases/get-payments/get-payments.query-handler.js';
import { GetPaymentStatusQuery } from '../../application/use-cases/get-payment-status/get-payment-status.query-handler.js';
import { GetPlansQuery } from '../../../plans/application/use-cases/get-plans/get-plans.query-handler.js';

const AUTO_RENEWAL_REQUESTED_BY_DEFAULT = true;

@Controller()
@PaymentsServiceControllerMethods()
@UseFilters(PaymentsRpcExceptionFilter)
export class PaymentsGrpcController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}
  async createCheckout(request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    const result = await this.commandBus.execute(
      new CreateCheckoutCommand({
        userId: Number(request.userId),
        planId: request.planId,
        idempotencyKey: request.idempotencyKey,
        provider: request.provider,
        autoRenewal: AUTO_RENEWAL_REQUESTED_BY_DEFAULT,
      }),
    );
    return { ...result, checkoutUrl: result.checkoutUrl ?? undefined };
  }
  getPlans(_request: GetPlansRequest): Promise<GetPlansResponse> {
    return this.queryBus.execute(new GetPlansQuery()).then((items) => ({ items }));
  }
  getPaymentStatus(request: GetPaymentStatusRequest): Promise<GetPaymentStatusResponse> {
    return this.queryBus.execute(new GetPaymentStatusQuery(request.paymentId, Number(request.userId)));
  }
  getPayments(request: GetPaymentsRequest): Promise<GetPaymentsResponse> {
    return this.queryBus.execute(
      new GetPaymentsQuery(Number(request.userId), request.pageNumber, request.pageSize),
    );
  }
}
