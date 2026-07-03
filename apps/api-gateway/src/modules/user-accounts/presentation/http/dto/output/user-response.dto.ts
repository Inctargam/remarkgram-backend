export class UserResponseDto {
  constructor(
    readonly id: number,
    readonly username: string,
    readonly email: string,
  ) {}
}
