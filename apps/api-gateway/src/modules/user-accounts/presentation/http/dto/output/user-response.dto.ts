import type { User } from '@app/user-accounts-grpc';

export class UserResponseDto {
  constructor(
    readonly id: number,
    readonly username: string,
    readonly email: string,
  ) {}

  static fromGrpc(user: User): UserResponseDto {
    return new UserResponseDto(user.id, user.username, user.email);
  }
}
