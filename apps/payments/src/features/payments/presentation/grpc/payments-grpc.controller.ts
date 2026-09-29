import { CreatePaymentResponse, PaymentsServiceControllerMethods } from '@app/payments-grpc';
import { Controller, UseFilters } from '@nestjs/common';
import { PaymentsRpcExceptionFilter } from '../../../../common/grpc/payments-rpc-exception.filter.ts';

@Controller()
@PaymentsServiceControllerMethods()
@UseFilters(PaymentsRpcExceptionFilter)
export class PaymentsGrpcController {
  async createPayment(): Promise<CreatePaymentResponse> {
    return Promise.resolve({});
  }
}
