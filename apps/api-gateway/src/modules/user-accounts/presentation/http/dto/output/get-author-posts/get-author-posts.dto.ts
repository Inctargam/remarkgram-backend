import { ApiProperty } from '@nestjs/swagger';
import { AuthorPostDto } from './author-post.dto.js';

export class GetAuthorPostsDto {
  @ApiProperty({
    description: 'Posts from the requested page.',
    type: () => [AuthorPostDto],
  })
  declare items: AuthorPostDto[];

  @ApiProperty({
    description: 'Whether another page is available.',
    example: true,
  })
  declare hasMore: boolean;

  @ApiProperty({
    description: 'Opaque cursor for the next page, or null when this is the last page.',
    example: 'eyJpZCI6NDIsImNyZWF0ZWRBdCI6IjIwMjYtMDgtMTFUMTE6MDA6MDAuMDAwWiJ9',
    nullable: true,
  })
  declare nextCursor: string | null;
}
