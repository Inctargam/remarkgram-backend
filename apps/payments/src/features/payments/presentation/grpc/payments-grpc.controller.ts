import {
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
  type GetPaymentStatusRequest,
  type GetPaymentStatusResponse,
  PaymentsServiceControllerMethods,
} from '@app/payments-grpc';
import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { PaymentsRpcExceptionFilter } from '../../../../common/grpc/payments-rpc-exception.filter.js';
import { CreateCheckoutCommand } from '../../application/use-cases/create-checkout.use-case.js';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case.js';

@Controller()
@PaymentsServiceControllerMethods()
@UseFilters(PaymentsRpcExceptionFilter)
export class PaymentsGrpcController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly getPaymentStatusUseCase: GetPaymentStatusUseCase,
  ) {}
  async createCheckout(request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    console.log('call procedure', request);
    try {
      const result = await this.commandBus.execute(
        new CreateCheckoutCommand({
          userId: Number(request.userId),
          planId: request.planId,
          idempotencyKey: request.idempotencyKey,
          provider: request.provider,
          autoRenewal: request.autoRenewal,
        }),
      );
      return { ...result, checkoutUrl: result.checkoutUrl ?? '' };
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
  getPaymentStatus(request: GetPaymentStatusRequest): Promise<GetPaymentStatusResponse> {
    return this.getPaymentStatusUseCase.execute({
      userId: Number(request.userId),
      paymentId: request.paymentId,
    });
  }
}
