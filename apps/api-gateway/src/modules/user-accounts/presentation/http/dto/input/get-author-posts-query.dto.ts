import { Type } from 'class-transformer';
import { IsBase64, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetAuthorPostsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of posts returned in one page.',
    example: 8,
    default: 8,
    minimum: 1,
    maximum: 20,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 8;

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
