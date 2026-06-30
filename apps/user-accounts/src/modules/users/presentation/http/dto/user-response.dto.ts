import type { User } from '../../../domain/entities/user.entity.js';

export class UserResponseDto {
  constructor(
    readonly id: number,
    readonly username: string,
    readonly email: string,
  ) {}

  static fromDomain(user: User): UserResponseDto {
    return new UserResponseDto(user.id, user.username, user.email);
  }
}
