import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { IsPassword } from '../../../../../../common/http/decorators/is-password.decorator.js';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class RegistrationDto {
  @IsString()
  @Trim()
  @Length(6, 30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  declare username: string;

  @Trim()
  @IsEmail()
  declare email: string;

  @IsPassword()
  declare password: string;
}
