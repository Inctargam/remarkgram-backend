import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ConfirmPasswordResetDto {
  @Trim()
  @IsNotEmpty()
  declare token: string;

  @IsString()
  @Length(6, 20)
  @Matches(/[0-9]/)
  @Matches(/[A-Z]/)
  @Matches(/[a-z]/)
  @Matches(/^[\x21-\x5F\x61-\x7E]+$/)
  declare newPassword: string;
}
