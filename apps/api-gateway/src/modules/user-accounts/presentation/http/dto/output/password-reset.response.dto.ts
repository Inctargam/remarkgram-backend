import { ApiProperty } from '@nestjs/swagger';

export class PasswordResetResponse {
  @ApiProperty({ example: 'If this email exists, password reset instructions were sent.' })
  readonly message: string = 'If this email exists, password reset instructions were sent.';
  constructor() {}
}
