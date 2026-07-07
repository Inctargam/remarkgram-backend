import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  readonly id: number;

  @ApiProperty({ example: 'user_123' })
  readonly username: string;

  @ApiProperty({ example: 'user@example.com', format: 'email' })
  readonly email: string;

  constructor(id: number, username: string, email: string) {
    this.id = id;
    this.username = username;
    this.email = email;
  }
}
