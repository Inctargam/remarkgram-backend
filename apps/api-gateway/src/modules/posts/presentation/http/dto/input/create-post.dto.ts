import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH, MIN_IMAGES_PER_POST } from '@app/posts-grpc';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID, ValidateIf } from 'class-validator';

export class CreatePostDto {
  @ApiPropertyOptional({
    description:
      'Optional post description. An omitted value is stored as NULL; an empty string remains empty.',
    example: 'A new post',
    maxLength: MAX_POST_DESCRIPTION_LENGTH,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  declare readonly description?: string;

  @ApiProperty({
    description:
      'Completed image upload IDs in display order. Every image must belong to the authenticated author.',
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    example: ['83d26252-a350-4e39-a78e-0bdf54d2341d'],
    minItems: MIN_IMAGES_PER_POST,
    maxItems: MAX_IMAGES_PER_POST,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  declare readonly imageIds: string[];
}
