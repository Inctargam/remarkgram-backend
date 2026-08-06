import { ApiProperty } from '@nestjs/swagger';

export class CreatePostResponseDto {
  @ApiProperty({ description: 'Identifier of the newly created post.', example: 10 })
  declare readonly id: number;
}
