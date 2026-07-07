import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsPassword } from '../../../../../../common/http/decorators/is-password.decorator.js';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class RegistrationDto {
  @ApiProperty({
    example: 'user_123',
    minLength: 6,
    maxLength: 30,
    pattern: '^[A-Za-z0-9_-]+$',
  })
  @IsString()
  @Trim()
  @Length(6, 30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  declare username: string;

  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @Trim()
  @IsEmail()
  declare email: string;

  @ApiProperty({
    example: 'Password1!',
    minLength: 6,
    maxLength: 20,
    description: 'Must contain at least one digit, one uppercase letter and one lowercase letter.',
  })
  @IsPassword()
  declare password: string;
}
