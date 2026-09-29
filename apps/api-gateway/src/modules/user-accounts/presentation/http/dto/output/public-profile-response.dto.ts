import { ApiProperty } from '@nestjs/swagger';

export class PublicProfileResponseDto {
  @ApiProperty({ description: 'User identifier.', example: 42 })
  readonly userId: number;

  @ApiProperty({ description: 'Public username.', example: 'client123' })
  readonly username: string;

  @ApiProperty({
    description: 'Public profile biography.',
    type: String,
    nullable: true,
    example: 'Backend developer',
  })
  readonly aboutMe: string | null;

  @ApiProperty({
    description: 'Identifier of the profile avatar file.',
    type: String,
    format: 'uuid',
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  readonly avatarFileId: string | null;

  constructor(params: PublicProfileResponseDto) {
    this.userId = params.userId;
    this.username = params.username;
    this.aboutMe = params.aboutMe;
    this.avatarFileId = params.avatarFileId;
  }
}
