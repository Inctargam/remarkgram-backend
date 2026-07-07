import {
  Controller,
  Delete,
  ForbiddenException,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  ApiBadGatewayResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  TESTING_SERVICE_NAME,
  type TestingServiceClient,
} from '@app/user-accounts-grpc';
import { timingSafeEqual } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { apiGatewayConfig } from '../../../../../config/api-gateway.config.js';

@ApiTags('Testing')
@ApiSecurity('testingKey')
@Controller('testing')
export class TestingHttpController implements OnModuleInit {
  private testingClient!: TestingServiceClient;

  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
    @Inject(apiGatewayConfig.KEY)
    private readonly config: ConfigType<typeof apiGatewayConfig>,
  ) {}

  onModuleInit(): void {
    this.testingClient = this.grpcClient.getService<TestingServiceClient>(TESTING_SERVICE_NAME);
  }

  @Public()
  @Delete('all-data')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete all data from the user-accounts database' })
  @ApiNoContentResponse({ description: 'All user-accounts data was deleted.' })
  @ApiNotFoundResponse({ description: 'The testing endpoint is disabled.' })
  @ApiForbiddenResponse({ description: 'The testing endpoint key is invalid.' })
  @ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
  @ApiServiceUnavailableResponse({ description: 'The user-accounts service is unavailable.' })
  async deleteAllData(@Headers('X-Testing-Key') testingKey: string | undefined): Promise<void> {
    if (!this.config.testingEndpointsEnabled) {
      throw new NotFoundException();
    }

    if (!this.isTestingKeyValid(testingKey)) {
      throw new ForbiddenException();
    }

    await firstValueFrom(this.testingClient.deleteAllData({}));
  }

  private isTestingKeyValid(candidate: string | undefined): boolean {
    const expected = this.config.testingEndpointKey;
    if (!candidate || !expected) return false;

    const candidateBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);
    return (
      candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  }
}
