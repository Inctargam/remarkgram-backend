import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetUsersQuery } from '../../../application/use-cases/get-users.use-case.js';
import { UserResponseDto } from '../dto/user-response.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async findMany(): Promise<UserResponseDto[]> {
    const users = await this.queryBus.execute(new GetUsersQuery());

    return users.map((user) => UserResponseDto.fromDomain(user));
  }
}
