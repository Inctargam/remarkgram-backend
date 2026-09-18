import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';
import { IsUsername } from '../../decorators/is-username.decorator.js';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  BIRTH_DATE_REGEX,
  PERSONAL_INFO_ABOUT_ME_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MIN_LENGTH,
  PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
  PERSONAL_INFO_LAST_NAME_MIN_LENGTH,
  USERNAME_MAZ_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@app/user-accounts-grpc';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserProfileDto {
  @ApiProperty({
    example: 'username',
    type: 'string',
    format: `${USERNAME_PATTERN}`,
    minLength: USERNAME_MIN_LENGTH,
    maxLength: USERNAME_MAZ_LENGTH,
    required: true,
  })
  @Trim()
  @IsUsername()
  declare username: string;

  @ApiProperty({
    example: 'First name',
    type: 'string',
    minLength: PERSONAL_INFO_FIRST_NAME_MIN_LENGTH,
    maxLength: PERSONAL_INFO_FIRST_NAME_MAX_LENGTH,
    required: true,
  })
  @Trim()
  @IsString()
  @Length(PERSONAL_INFO_FIRST_NAME_MIN_LENGTH, PERSONAL_INFO_FIRST_NAME_MAX_LENGTH)
  declare firstName: string;

  @ApiProperty({
    example: 'Last name',
    type: 'string',
    minLength: PERSONAL_INFO_LAST_NAME_MIN_LENGTH,
    maxLength: PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
    required: true,
  })
  @Trim()
  @IsString()
  @Length(PERSONAL_INFO_LAST_NAME_MIN_LENGTH, PERSONAL_INFO_LAST_NAME_MAX_LENGTH)
  declare lastName: string;

  @ApiProperty({
    example: '12.12.2012',
    format: `${BIRTH_DATE_REGEX}`,
    type: 'string',
    required: false,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(BIRTH_DATE_REGEX)
  declare dateOfBirth: string;

  @ApiProperty({
    example: 'About me',
    type: 'string',
    maxLength: PERSONAL_INFO_ABOUT_ME_MAX_LENGTH,
    required: false,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH)
  declare aboutMe: string;

  @ApiProperty({
    example: 'US',
    description: 'Country names keyed by ISO 639-1 language code.',
    type: 'string',
    maxLength: 10,
    required: false,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 10)
  declare countryCode: string;

  @ApiProperty({
    example: 'New York',
    type: 'string',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @Trim()
  @IsString()
  declare city: string;
}
