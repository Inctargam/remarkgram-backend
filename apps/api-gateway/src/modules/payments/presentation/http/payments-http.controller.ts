import {
  PAYMENTS_SERVICE_NAME,
  type PaymentsServiceClient,
  REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME,
} from '@app/payments-grpc';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { AuthenticatedRequest } from '../../../../common/http/authenticated-request.js';
import { IdempotencyKey } from '../../../../common/http/decorators/idempotency-key.decorator.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import { PaymentIdParams } from './dto/payment-id.params.js';

@Controller('payments')
export class PaymentsHttpController implements OnModuleInit {
  private client!: PaymentsServiceClient;
  constructor(@Inject(REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME) private readonly grpcClient: ClientGrpc) {}
  onModuleInit(): void {
    this.client = this.grpcClient.getService(PAYMENTS_SERVICE_NAME);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  createCheckout(
    @Body() input: CreateCheckoutDto,
    @Req() request: AuthenticatedRequest,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.client.createCheckout({
      userId: Number(request.userId),
      planId: input.planId,
      idempotencyKey,
    });
  }

  @Get(':paymentId/status')
  getStatus(@Param() params: PaymentIdParams, @Req() request: AuthenticatedRequest) {
    return this.client.getPaymentStatus({ userId: Number(request.userId), paymentId: params.paymentId });
  }
}
