import { IsEmail, IsString, Length, Matches } from 'class-validator';
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

  @IsString()
  @Length(6, 20)
  @Matches(/[0-9]/)
  @Matches(/[A-Z]/)
  @Matches(/[a-z]/)
  @Matches(/^[\x21-\x5F\x61-\x7E]+$/)
  declare password: string;
}
