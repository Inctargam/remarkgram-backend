import {
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  TESTING_SERVICE_NAME as FILES_TESTING_SERVICE_NAME,
  type TestingServiceClient as FilesTestingServiceClient,
} from '@app/files-grpc';
import {
  REMARKGRAM_POSTS_V1_PACKAGE_NAME,
  TESTING_SERVICE_NAME as POSTS_TESTING_SERVICE_NAME,
  type TestingServiceClient as PostsTestingServiceClient,
} from '@app/posts-grpc';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  TESTING_SERVICE_NAME as USER_ACCOUNTS_TESTING_SERVICE_NAME,
  type TestingServiceClient as UserAccountsTestingServiceClient,
} from '@app/user-accounts-grpc';
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
import { timingSafeEqual } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { apiGatewayConfig } from '../../../../../config/api-gateway.config.js';
import { ApiDeleteAllData } from '../swagger/delete-all-data.swagger.js';
import { ApiTestingController } from '../swagger/testing-controller.swagger.js';

@ApiTestingController()
@Controller('testing')
export class TestingHttpController implements OnModuleInit {
  private filesTestingClient!: FilesTestingServiceClient;
  private postsTestingClient!: PostsTestingServiceClient;
  private userAccountsTestingClient!: UserAccountsTestingServiceClient;

  constructor(
    @Inject(REMARKGRAM_FILES_V1_PACKAGE_NAME)
    private readonly filesGrpcClient: ClientGrpc,
    @Inject(REMARKGRAM_POSTS_V1_PACKAGE_NAME)
    private readonly postsGrpcClient: ClientGrpc,
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly userAccountsGrpcClient: ClientGrpc,
    @Inject(apiGatewayConfig.KEY)
    private readonly config: ConfigType<typeof apiGatewayConfig>,
  ) {}

  onModuleInit(): void {
    this.filesTestingClient =
      this.filesGrpcClient.getService<FilesTestingServiceClient>(FILES_TESTING_SERVICE_NAME);
    this.postsTestingClient =
      this.postsGrpcClient.getService<PostsTestingServiceClient>(POSTS_TESTING_SERVICE_NAME);
    this.userAccountsTestingClient = this.userAccountsGrpcClient.getService<UserAccountsTestingServiceClient>(
      USER_ACCOUNTS_TESTING_SERVICE_NAME,
    );
  }

  @Public()
  @Delete('all-data')
  @HttpCode(204)
  @ApiDeleteAllData()
  async deleteAllData(@Headers('X-Testing-Key') testingKey: string | undefined): Promise<void> {
    if (!this.config.testingEndpointsEnabled) {
      throw new NotFoundException();
    }

    if (!this.isTestingKeyValid(testingKey)) {
      throw new ForbiddenException();
    }

    await Promise.all([
      firstValueFrom(this.filesTestingClient.deleteAllData({})),
      firstValueFrom(this.postsTestingClient.deleteAllData({})),
      firstValueFrom(this.userAccountsTestingClient.deleteAllData({})),
    ]);
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
