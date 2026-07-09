import { Controller, Get, Inject, type OnModuleInit } from '@nestjs/common';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USERS_SERVICE_NAME,
  type UsersServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { ApiExcludeController } from '@nestjs/swagger';
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
