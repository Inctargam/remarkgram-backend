import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class ConfirmRegistrationDto {
  @ApiProperty({ example: '34c78352-97d1-4f2f-a0a2-41e28365d926' })
  @IsString()
  @Trim()
  @IsNotEmpty()
  declare code: string;
}
