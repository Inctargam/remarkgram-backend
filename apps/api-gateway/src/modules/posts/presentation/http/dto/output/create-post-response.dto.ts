import { ApiProperty } from '@nestjs/swagger';

export class CreatePostResponseDto {
  @ApiProperty({ example: 10 })
  declare readonly id: number;
}
