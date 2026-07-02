import { Controller, Get } from '@nestjs/common';
import type { User } from '@app/user-accounts-grpc';
import { Public } from '../../../../../common/presentation/http/decorators/public.decorator.js';
import { UserAccountsGrpcClientAdapter } from '../../../infrastructure/grpc/user-accounts-grpc-client.adapter.js';

@Controller('users')
export class UsersHttpController {
  constructor(private readonly userAccountsClient: UserAccountsGrpcClientAdapter) {}

  @Public()
  @Get()
  async findMany(): Promise<User[]> {
    const response = await this.userAccountsClient.getUsers();
    return response.users;
  }
}
