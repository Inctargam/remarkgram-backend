import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetPublicProfileParamsDto {
  @ApiProperty({
    name: 'userId',
    description: 'User ID for viewing a public profile.',
    required: true,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare userId: number;
}
