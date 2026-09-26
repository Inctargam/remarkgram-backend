import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';
import { IsUsername } from '../../decorators/is-username.decorator.js';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  BIRTH_DATE_REGEX,
  PERSONAL_INFO_ABOUT_ME_MAX_LENGTH,
  PERSONAL_INFO_CITY_MAX_LENGTH,
  PERSONAL_INFO_CITY_MIN_LENGTH,
  PERSONAL_INFO_CITY_PATTERN,
  PERSONAL_INFO_COUNTRY_CODE_LENGTH,
  PERSONAL_INFO_COUNTRY_CODE_PATTERN,
  PERSONAL_INFO_FIRST_NAME_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MIN_LENGTH,
  PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
  PERSONAL_INFO_LAST_NAME_MIN_LENGTH,
  PERSONAL_INFO_NAME_PATTERN,
  USERNAME_MAZ_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@app/user-accounts-grpc';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';

export class UpdateProfileInfoDto {
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
    pattern: PERSONAL_INFO_NAME_PATTERN.source,
    required: true,
  })
  @Trim()
  @IsString()
  @Length(PERSONAL_INFO_FIRST_NAME_MIN_LENGTH, PERSONAL_INFO_FIRST_NAME_MAX_LENGTH)
  @Matches(PERSONAL_INFO_NAME_PATTERN)
  declare firstName: string;

  @ApiProperty({
    example: 'Last name',
    type: 'string',
    minLength: PERSONAL_INFO_LAST_NAME_MIN_LENGTH,
    maxLength: PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
    pattern: PERSONAL_INFO_NAME_PATTERN.source,
    required: true,
  })
  @Trim()
  @IsString()
  @Length(PERSONAL_INFO_LAST_NAME_MIN_LENGTH, PERSONAL_INFO_LAST_NAME_MAX_LENGTH)
  @Matches(PERSONAL_INFO_NAME_PATTERN)
  declare lastName: string;

  @ApiProperty({
    example: '2012-12-12',
    format: 'date',
    pattern: BIRTH_DATE_REGEX.source,
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
    description: 'ISO 3166-1 alpha-2 country code.',
    type: 'string',
    minLength: PERSONAL_INFO_COUNTRY_CODE_LENGTH,
    maxLength: PERSONAL_INFO_COUNTRY_CODE_LENGTH,
    pattern: PERSONAL_INFO_COUNTRY_CODE_PATTERN.source,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : (value as unknown),
  )
  @IsString()
  @Length(PERSONAL_INFO_COUNTRY_CODE_LENGTH, PERSONAL_INFO_COUNTRY_CODE_LENGTH)
  @Matches(PERSONAL_INFO_COUNTRY_CODE_PATTERN)
  declare countryCode: string;

  @ApiProperty({
    example: 'New York',
    type: 'string',
    minLength: PERSONAL_INFO_CITY_MIN_LENGTH,
    maxLength: PERSONAL_INFO_CITY_MAX_LENGTH,
    pattern: PERSONAL_INFO_CITY_PATTERN.source,
    required: false,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(PERSONAL_INFO_CITY_MIN_LENGTH, PERSONAL_INFO_CITY_MAX_LENGTH)
  @Matches(PERSONAL_INFO_CITY_PATTERN)
  declare city: string;
}
