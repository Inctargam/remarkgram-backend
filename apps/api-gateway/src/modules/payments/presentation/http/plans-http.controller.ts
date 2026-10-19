import {
  PAYMENTS_SERVICE_NAME,
  type PaymentsServiceClient,
  REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME,
} from '@app/payments-grpc';
import { Controller, Get, Inject, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Public } from '../../../../common/http/decorators/public.decorator.js';
import { PlanResponseDto } from './dto/plan-response.dto.js';
import { PaymentsHttpResponseMapper } from './mappers/payments-http-response.mapper.js';
import { ApiGetPlans } from './swagger/get/get-plans.swagger.js';
import { ApiPlansController } from './swagger/plans-controller.swagger.js';

@Public()
@ApiPlansController()
@Controller('plans')
export class PlansHttpController implements OnModuleInit {
  private client!: PaymentsServiceClient;

  constructor(@Inject(REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME) private readonly grpcClient: ClientGrpc) {}

  onModuleInit(): void {
    this.client = this.grpcClient.getService(PAYMENTS_SERVICE_NAME);
  }

  @Get()
  @ApiGetPlans()
  async getPlans(): Promise<PlanResponseDto[]> {
    const response = await firstValueFrom(this.client.getPlans({}));
    return PaymentsHttpResponseMapper.toPlans(response);
  }
}
