import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';
import { IsNotEmpty } from 'class-validator';
import { IsPassword } from '../../../../../../common/http/decorators/is-password.decorator.js';

export class ConfirmPasswordResetDto {
  @Trim()
  @IsNotEmpty()
  declare token: string;

  @IsPassword()
  declare newPassword: string;
}
