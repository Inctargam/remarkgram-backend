import { ApiProperty } from '@nestjs/swagger';
import { MAX_AVATAR_SIZE_BYTES, MIN_IMAGE_SIZE_BYTES } from '@app/files-grpc';
import { ImageUploadMetadataDto } from './initiate-image-uploads.dto.js';

export class InitiateAvatarUploadDto extends ImageUploadMetadataDto {
  @ApiProperty({
    description:
      'Exact size of the final avatar file in bytes after any client-side crop. Maximum: 10 MiB inclusive.',
    example: 1_048_576,
    minimum: MIN_IMAGE_SIZE_BYTES,
    maximum: MAX_AVATAR_SIZE_BYTES,
  })
  declare readonly size: number;
}
