import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { User } from '../../domain/entities/user.entity.js';
import { UsersRepository } from '../ports/users.repository.js';

export class GetUsersQuery extends Query<User[]> {}

@QueryHandler(GetUsersQuery)
export class GetUsersUseCase implements IQueryHandler<GetUsersQuery> {
  constructor(private readonly usersRepository: UsersRepository) {}

  execute() {
    return this.usersRepository.findMany();
  }
}
