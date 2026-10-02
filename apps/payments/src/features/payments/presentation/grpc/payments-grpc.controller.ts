import {
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
  type GetPaymentStatusRequest,
  type GetPaymentStatusResponse,
  PaymentsServiceControllerMethods,
} from '@app/payments-grpc';
import { Controller, UseFilters } from '@nestjs/common';
import { PaymentsRpcExceptionFilter } from '../../../../common/grpc/payments-rpc-exception.filter.js';
import { CreateCheckoutUseCase } from '../../application/use-cases/create-checkout.use-case.js';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case.js';

@Controller()
@PaymentsServiceControllerMethods()
@UseFilters(PaymentsRpcExceptionFilter)
export class PaymentsGrpcController {
  constructor(
    private readonly createCheckoutUseCase: CreateCheckoutUseCase,
    private readonly getPaymentStatusUseCase: GetPaymentStatusUseCase,
  ) {}
  createCheckout(request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    console.log(request);
    return this.createCheckoutUseCase.execute({
      userId: Number(request.userId),
      planId: request.planId,
      idempotencyKey: request.idempotencyKey,
    });
  }
  getPaymentStatus(request: GetPaymentStatusRequest): Promise<GetPaymentStatusResponse> {
    return this.getPaymentStatusUseCase.execute({
      userId: Number(request.userId),
      paymentId: request.paymentId,
    });
  }
}
