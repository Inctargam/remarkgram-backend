import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Trim } from '../../../../../../common/presentation/http/decorators/trim.decorator.js';

export class LoginDto {
  @Trim()
  @IsEmail()
  declare email: string;

  @IsString()
  @Trim()
  @IsNotEmpty()
  declare password: string;
}
