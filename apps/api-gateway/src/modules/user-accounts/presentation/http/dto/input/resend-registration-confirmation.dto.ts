import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class ResendRegistrationConfirmationDto {
  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @Trim()
  @IsEmail()
  declare email: string;
}
