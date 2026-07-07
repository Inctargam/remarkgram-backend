import { Controller, Get, Inject, type OnModuleInit } from '@nestjs/common';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USERS_SERVICE_NAME,
  type UsersServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  ApiBadGatewayResponse,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { map, type Observable } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { UserResponseDto } from '../dto/output/user-response.dto.js';

@ApiExcludeController()
@Controller('users')
export class UsersHttpController implements OnModuleInit {
  private usersClient!: UsersServiceClient;

  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.usersClient = this.grpcClient.getService<UsersServiceClient>(USERS_SERVICE_NAME);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get users' })
  @ApiOkResponse({ type: [UserResponseDto] })
  @ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
  @ApiServiceUnavailableResponse({ description: 'The user-accounts service is unavailable.' })
  findMany(): Observable<UserResponseDto[]> {
    return this.usersClient
      .getUsers({})
      .pipe(
        map((response) =>
          response.users.map((user) => new UserResponseDto(user.id, user.username, user.email)),
        ),
      );
  }
}
