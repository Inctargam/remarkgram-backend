import { IsNotEmpty, IsString } from 'class-validator';
import { Trim } from '../../../../../../common/presentation/http/decorators/trim.decorator.js';

export class LoginDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  declare loginOrEmail: string;

  @IsString()
  @Trim()
  @IsNotEmpty()
  declare password: string;
}
