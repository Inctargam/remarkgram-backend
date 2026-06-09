import type { User } from '../../../domain/entities/user.entity.js';

export class UserResponseDto {
  constructor(
    readonly id: number,
    readonly email: string,
    readonly name: string,
  ) {}

  static fromDomain(user: User): UserResponseDto {
    return new UserResponseDto(user.id, user.email, user.name);
  }
}
