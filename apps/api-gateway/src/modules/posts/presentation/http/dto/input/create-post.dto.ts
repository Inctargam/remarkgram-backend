import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH, MIN_IMAGES_PER_POST } from '@app/posts-grpc';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID, ValidateIf } from 'class-validator';

export class CreatePostDto {
  @ApiPropertyOptional({
    example: 'A new post',
    maxLength: MAX_POST_DESCRIPTION_LENGTH,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  declare readonly description?: string;

  @ApiProperty({
    type: [String],
    example: ['83d26252-a350-4e39-a78e-0bdf54d2341d'],
    minItems: MIN_IMAGES_PER_POST,
    maxItems: MAX_IMAGES_PER_POST,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  declare readonly imageIds: string[];
}
