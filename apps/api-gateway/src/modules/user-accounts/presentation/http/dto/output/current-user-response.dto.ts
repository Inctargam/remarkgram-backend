import { ApiProperty } from '@nestjs/swagger';

export const LOGIN_METHODS = ['password', 'github', 'google'] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

export class CurrentUserResponseDto {
  @ApiProperty({ example: 42 })
  readonly id: number;

  @ApiProperty({ example: 'client123' })
  readonly username: string;

  @ApiProperty({ example: 'user@example.com', format: 'email' })
  readonly email: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  readonly avatarUrl: string | null;

  @ApiProperty({ example: true })
  readonly emailVerified: boolean;

  @ApiProperty({ enum: LOGIN_METHODS, isArray: true, example: ['password', 'github'] })
  readonly loginMethods: LoginMethod[];

  @ApiProperty({ example: '2026-08-21T10:15:00.000Z', format: 'date-time' })
  readonly createdAt: string;

  constructor(params: {
    id: number;
    username: string;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    loginMethods: LoginMethod[];
    createdAt: string;
  }) {
    this.id = params.id;
    this.username = params.username;
    this.email = params.email;
    this.avatarUrl = params.avatarUrl;
    this.emailVerified = params.emailVerified;
    this.loginMethods = params.loginMethods;
    this.createdAt = params.createdAt;
  }
}
