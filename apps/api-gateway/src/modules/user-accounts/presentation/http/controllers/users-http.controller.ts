import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../../../common/presentation/http/decorators/public.decorator.js';
import { UserAccountsGrpcClientAdapter } from '../../../infrastructure/grpc/user-accounts-grpc-client.adapter.js';
import { UserResponseDto } from '../dto/output/user-response.dto.js';

@Controller('users')
export class UsersHttpController {
  constructor(private readonly userAccountsClient: UserAccountsGrpcClientAdapter) {}

  @Public()
  @Get()
  async findMany(): Promise<UserResponseDto[]> {
    const response = await this.userAccountsClient.getUsers();
    return response.users.map((user) => UserResponseDto.fromGrpc(user));
  }
}
