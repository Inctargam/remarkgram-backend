import { Type } from 'class-transformer';
import { IsBase64, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_POSTS_PAGE_SIZE,
  MAX_POSTS_PAGE_SIZE,
  MIN_POSTS_PAGE_SIZE,
} from '@app/posts-grpc';

export class GetAuthorPostsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of posts returned in one page.',
    example: 8,
    default: DEFAULT_POSTS_PAGE_SIZE,
    minimum: MIN_POSTS_PAGE_SIZE,
    maximum: MAX_POSTS_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(MIN_POSTS_PAGE_SIZE)
  @Max(MAX_POSTS_PAGE_SIZE)
  limit = DEFAULT_POSTS_PAGE_SIZE;

  @ApiPropertyOptional({
    description: 'Opaque Base64 cursor returned as nextCursor by the previous page.',
    example: 'eyJpZCI6NDIsImNyZWF0ZWRBdCI6IjIwMjYtMDgtMTFUMTE6MDA6MDAuMDAwWiJ9',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  declare cursor?: string;
}
