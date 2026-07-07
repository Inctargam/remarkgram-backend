import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ description: 'HTTP status code.' })
  readonly statusCode: number;

  @ApiProperty({ description: 'Stable machine-readable application error code.' })
  readonly code: string;

  @ApiProperty({ description: 'Human-readable diagnostic message.' })
  readonly message: string;

  constructor(statusCode: number, code: string, message: string) {
    this.statusCode = statusCode;
    this.code = code;
    this.message = message;
  }
}
