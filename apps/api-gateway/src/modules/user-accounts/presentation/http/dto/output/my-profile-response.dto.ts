import { ApiProperty } from '@nestjs/swagger';
import { CountryResponseDto } from '../../../../../countries/presentation/http/dto/output/country-response.dto.js';

export class MyProfileResponseDto {
  @ApiProperty({ description: 'User identifier.', example: 42 })
  readonly userId: number;

  @ApiProperty({ description: 'Username.', example: 'client123' })
  readonly username: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ivan' })
  readonly firstName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Ivanov' })
  readonly lastName: string | null;

  @ApiProperty({
    description: 'ISO 8601 calendar date in YYYY-MM-DD format.',
    type: String,
    format: 'date',
    nullable: true,
    example: '1990-01-15',
  })
  readonly dateOfBirth: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Backend developer' })
  readonly aboutMe: string | null;

  @ApiProperty({
    description: 'Country with localized names.',
    type: () => CountryResponseDto,
    nullable: true,
  })
  readonly country: CountryResponseDto | null;

  @ApiProperty({ type: String, nullable: true, example: 'Kyiv' })
  readonly city: string | null;

  @ApiProperty({
    description: 'Identifier of the profile avatar file.',
    type: String,
    format: 'uuid',
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  readonly avatarFileId: string | null;

  constructor(params: MyProfileResponseDto) {
    this.userId = params.userId;
    this.username = params.username;
    this.firstName = params.firstName;
    this.lastName = params.lastName;
    this.dateOfBirth = params.dateOfBirth;
    this.aboutMe = params.aboutMe;
    this.country = params.country;
    this.city = params.city;
    this.avatarFileId = params.avatarFileId;
  }
}
