import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';
import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsPassword } from '../../../../../../common/http/decorators/is-password.decorator.js';

export class ConfirmPasswordResetDto {
  @ApiProperty({ example: 'password-reset-token' })
  @Trim()
  @IsNotEmpty()
  declare token: string;

  @ApiProperty({
    example: 'NewPassword1!',
    minLength: 6,
    maxLength: 20,
    description: 'Must contain at least one digit, one uppercase letter and one lowercase letter.',
  })
  @IsPassword()
  declare newPassword: string;
}
