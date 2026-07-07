import { IsNotEmpty, IsString } from 'class-validator';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class ConfirmRegistrationDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  declare code: string;
}
