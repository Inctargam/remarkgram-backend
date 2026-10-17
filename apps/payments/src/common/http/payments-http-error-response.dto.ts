import { ApiProperty } from '@nestjs/swagger';

export class PaymentsHttpErrorResponseDto {
  @ApiProperty({ description: 'HTTP status code.' })
  declare readonly statusCode: number;

  @ApiProperty({ description: 'Stable machine-readable application error code.' })
  declare readonly code: string;

  @ApiProperty({ description: 'Human-readable diagnostic message.' })
  declare readonly message: string;

  constructor(statusCode: number, code: string, message: string) {
    this.statusCode = statusCode;
    this.code = code;
    this.message = message;
  }
}
