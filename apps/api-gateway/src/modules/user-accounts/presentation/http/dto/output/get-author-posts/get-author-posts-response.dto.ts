import { ApiProperty } from '@nestjs/swagger';
import { AuthorPostResponseDto } from './author-post-response.dto.js';

export class GetAuthorPostsResponseDto {
  @ApiProperty({
    description: 'Posts from the requested page.',
    type: () => [AuthorPostResponseDto],
  })
  declare items: AuthorPostResponseDto[];

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
