import { ApiProperty } from '@nestjs/swagger';

export class ValidationErrorResponseDto {
  @ApiProperty({ example: 400 })
  declare readonly statusCode: number;

  @ApiProperty({ example: ['email must be an email'], type: [String] })
  declare readonly message: string[];

  @ApiProperty({ example: 'Bad Request' })
  declare readonly error: string;
}
