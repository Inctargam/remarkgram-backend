import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsPassword } from '../../../../../../common/http/decorators/is-password.decorator.js';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';
import { USERNAME_MAZ_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from '@app/user-accounts-grpc';

export class RegistrationDto {
  @ApiProperty({
    example: 'user_123',
    minLength: 6,
    maxLength: 30,
    pattern: '^[A-Za-z0-9_-]+$',
  })
  @IsString()
  @Trim()
  @Length(USERNAME_MIN_LENGTH, USERNAME_MAZ_LENGTH)
  @Matches(USERNAME_PATTERN)
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
