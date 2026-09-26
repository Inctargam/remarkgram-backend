import { ApiProperty } from '@nestjs/swagger';
import { AuthorPostImageDto } from './author-post-image.dto.js';

export class AuthorPostDto {
  @ApiProperty({ description: 'Post identifier.', example: 42, type: Number })
  declare id: number;

  @ApiProperty({ description: 'Author identifier.', example: 7, type: Number })
  declare authorId: number;

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
    type: () => [AuthorPostImageDto],
  })
  declare images: AuthorPostImageDto[];
}
