import { Controller, UseFilters } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { UsersServiceControllerMethods } from '@app/user-accounts-grpc';
import type { GetUsersResponse } from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import { GetUsersQuery } from '../../../application/use-cases/get-users.use-case.js';

@Controller()
@UsersServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class UsersGrpcController {
  constructor(private readonly queryBus: QueryBus) {}

  async getUsers(): Promise<GetUsersResponse> {
    const users = await this.queryBus.execute(new GetUsersQuery());

    return {
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
      })),
    };
  }
}
