import { MAX_IMAGES_PER_UPLOAD_REQUEST, MIN_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class CompleteImageUploadsDto {
  @ApiProperty({
    type: [String],
    example: ['83d26252-a350-4e39-a78e-0bdf54d2341d'],
    minItems: MIN_IMAGES_PER_UPLOAD_REQUEST,
    maxItems: MAX_IMAGES_PER_UPLOAD_REQUEST,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  declare readonly uploadIds: string[];
}
