import { IsEmail } from 'class-validator';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class PasswordResetDto {
  @Trim()
  @IsEmail()
  declare email: string;
}
