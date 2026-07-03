import { IsNotEmpty, IsString } from 'class-validator';
import { Trim } from '../../../../../common/presentation/http/decorators/trim.decorator.js';

export class LoginInputDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  declare loginOrEmail: string;

  @IsString()
  @Trim()
  @IsNotEmpty()
  declare password: string;
}
