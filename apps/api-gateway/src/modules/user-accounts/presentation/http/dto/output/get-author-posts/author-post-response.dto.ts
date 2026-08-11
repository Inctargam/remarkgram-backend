import { ApiProperty } from '@nestjs/swagger';
import { AuthorPostImageResponseDto } from './author-post-image-response.dto.js';

export class AuthorPostResponseDto {
  @ApiProperty({ description: 'Post identifier.', example: '42' })
  declare id: string;

  @ApiProperty({ description: 'Author identifier.', example: '7' })
  declare authorId: string;

  @ApiProperty({
    description: 'Post description, or null when the post has no description.',
    example: 'My first post',
    nullable: true,
  })
  declare description: string | null;

  @ApiProperty({
    description: 'Post creation date in ISO 8601 format.',
    example: '2026-08-11T11:00:00.000Z',
    format: 'date-time',
  })
  declare createdAt: string;

  @ApiProperty({
    description: 'Post images ordered by position.',
    type: () => [AuthorPostImageResponseDto],
  })
  declare images: AuthorPostImageResponseDto[];
}
