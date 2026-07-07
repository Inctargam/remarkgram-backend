import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @Trim()
  @IsEmail()
  declare email: string;

  @ApiProperty({ example: 'Password1!', format: 'password' })
  @IsString()
  @Trim()
  @IsNotEmpty()
  declare password: string;
}
