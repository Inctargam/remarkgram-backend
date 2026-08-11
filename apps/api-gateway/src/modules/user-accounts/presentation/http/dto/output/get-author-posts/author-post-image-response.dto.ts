import { ApiProperty } from '@nestjs/swagger';

export class AuthorPostImageResponseDto {
  @ApiProperty({
    description: 'Image file identifier.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  declare fileId: string;

  @ApiProperty({
    description: 'Zero-based image position inside the post.',
    example: 0,
    minimum: 0,
  })
  declare position: number;
}
