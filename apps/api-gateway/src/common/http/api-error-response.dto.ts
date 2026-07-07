import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 409 })
  readonly statusCode: number;

  @ApiProperty({ example: 'EMAIL_ALREADY_EXISTS' })
  readonly code: string;

  @ApiProperty({ example: 'Email already exists' })
  readonly message: string;

  constructor(statusCode: number, code: string, message: string) {
    this.statusCode = statusCode;
    this.code = code;
    this.message = message;
  }
}
