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
  Query,
  Req,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { AuthenticatedRequest } from '../../../../common/http/authenticated-request.js';
import { IdempotencyKey } from '../../../../common/http/decorators/idempotency-key.decorator.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import { CreateCheckoutResponseDto } from './dto/create-checkout-response.dto.js';
import { PaymentIdParams } from './dto/payment-id.params.js';
import { GetPaymentsQueryDto } from './dto/get-payments-query.dto.js';
import { GetPaymentsResponseDto } from './dto/get-payments-response.dto.js';
import { PaymentStatusResponseDto } from './dto/payment-status-response.dto.js';
import { PaymentsHttpResponseMapper } from './mappers/payments-http-response.mapper.js';
import { firstValueFrom } from 'rxjs';
import { ApiPaymentsController } from './swagger/payments-controller.swagger.js';
import { ApiGetPaymentStatus } from './swagger/get/get-payment-status.swagger.js';
import { ApiGetPayments } from './swagger/get/get-payments.swagger.js';
import { ApiCreateCheckout } from './swagger/post/create-checkout.swagger.js';

@ApiPaymentsController()
@Controller('payments')
export class PaymentsHttpController implements OnModuleInit {
  private client!: PaymentsServiceClient;
  constructor(@Inject(REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME) private readonly grpcClient: ClientGrpc) {}
  onModuleInit(): void {
    this.client = this.grpcClient.getService(PAYMENTS_SERVICE_NAME);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateCheckout()
  async createCheckout(
    @Body() input: CreateCheckoutDto,
    @Req() request: AuthenticatedRequest,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<CreateCheckoutResponseDto> {
    const response = await firstValueFrom(
      this.client.createCheckout({
        userId: Number(request.userId),
        planId: input.planId,
        idempotencyKey,
        provider: input.provider,
      }),
    );
    return PaymentsHttpResponseMapper.toCreateCheckout(response);
  }

  @Get(':paymentId/status')
  @ApiGetPaymentStatus()
  async getStatus(
    @Param() params: PaymentIdParams,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaymentStatusResponseDto> {
    const response = await firstValueFrom(
      this.client.getPaymentStatus({ userId: Number(request.userId), paymentId: params.paymentId }),
    );
    return PaymentsHttpResponseMapper.toPaymentStatus(response);
  }

  @Get()
  @ApiGetPayments()
  async getPayments(
    @Query() query: GetPaymentsQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<GetPaymentsResponseDto> {
    const response = await firstValueFrom(
      this.client.getPayments({
        userId: Number(request.userId),
        pageNumber: query.pageNumber,
        pageSize: query.pageSize,
      }),
    );
    return PaymentsHttpResponseMapper.toPayments(response);
  }
}
