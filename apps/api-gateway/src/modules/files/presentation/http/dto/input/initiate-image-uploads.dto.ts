import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ImageContentType,
  MAX_IMAGES_PER_UPLOAD_REQUEST,
  MAX_IMAGE_SIZE_BYTES,
  MIN_IMAGES_PER_UPLOAD_REQUEST,
  MIN_IMAGE_SIZE_BYTES,
} from '@app/files-grpc';

const MIN_INT32_VALUE = -2_147_483_648;
const MAX_INT32_VALUE = 2_147_483_647;

export class ImageUploadMetadataDto {
  @ApiProperty({
    description: 'Client-generated correlation ID used to match the returned session to this local file.',
    example: '83d26252-a350-4e39-a78e-0bdf54d2341d',
    format: 'uuid',
  })
  @IsUUID()
  declare readonly clientFileId: string;

  @ApiProperty({
    description: 'Original filename kept as file metadata; it is not used as the Object Storage key.',
    example: 'photo.jpg',
  })
  @IsString()
  @IsNotEmpty()
  declare readonly originalFilename: string;

  @ApiProperty({
    description: 'MIME type of the exact file that will be uploaded. Only JPEG and PNG are supported.',
    example: ImageContentType.JPEG,
    enum: ImageContentType,
  })
  @IsString()
  @IsNotEmpty()
  declare readonly contentType: string;

  @ApiProperty({
    description:
      'Exact size of the final file in bytes. The presigned POST policy and completion check require this exact value.',
    example: 1_048_576,
    minimum: MIN_IMAGE_SIZE_BYTES,
    maximum: MAX_IMAGE_SIZE_BYTES,
  })
  // Проверяем только безопасную сериализацию в protobuf int32. Бизнес-диапазон 1–20 МиБ
  // проверяется в Files Service, чтобы не дублировать правило в транспортном слое.
  @IsInt()
  @Min(MIN_INT32_VALUE)
  @Max(MAX_INT32_VALUE)
  declare readonly size: number;
}

export class InitiateImageUploadsDto {
  @ApiProperty({
    description: 'Metadata for 1–10 final images after any client-side crop or filter processing.',
    type: () => [ImageUploadMetadataDto],
    minItems: MIN_IMAGES_PER_UPLOAD_REQUEST,
    maxItems: MAX_IMAGES_PER_UPLOAD_REQUEST,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageUploadMetadataDto)
  declare readonly images: ImageUploadMetadataDto[];
}
