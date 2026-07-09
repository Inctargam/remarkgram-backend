import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class PasswordResetDto {
  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @Trim()
  @IsEmail()
  declare email: string;

  @ApiProperty({ example: 'recaptcha-reset-token' })
  @Trim()
  @IsNotEmpty()
  declare recaptchaToken: string;
}
