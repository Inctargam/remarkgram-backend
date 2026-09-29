import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetAuthorPostsParamsDto {
  @ApiProperty({
    description: 'Numeric identifier of the author whose posts are requested.',
    example: 42,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare userId: number;
}
