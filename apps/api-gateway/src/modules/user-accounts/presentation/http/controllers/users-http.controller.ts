import { Controller, Get } from '@nestjs/common';
import type { User } from '@app/user-accounts-grpc';
import { UserAccountsGrpcClientAdapter } from '../../../infrastructure/grpc/user-accounts-grpc-client.adapter.js';
import { mapGrpcErrorToHttp } from '../grpc-error.mapper.js';

@Controller('users')
export class UsersHttpController {
  constructor(private readonly userAccountsClient: UserAccountsGrpcClientAdapter) {}

  @Get()
  async findMany(): Promise<User[]> {
    try {
      const response = await this.userAccountsClient.getUsers();
      return response.users;
    } catch (error) {
      throw mapGrpcErrorToHttp(error);
    }
  }
}
