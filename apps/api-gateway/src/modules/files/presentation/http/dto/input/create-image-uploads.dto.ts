import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ImageContentType,
  MAX_IMAGES_PER_UPLOAD_REQUEST,
  MAX_IMAGE_SIZE_BYTES,
  MIN_IMAGES_PER_UPLOAD_REQUEST,
  MIN_IMAGE_SIZE_BYTES,
} from '@app/files-grpc';

export class ImageUploadMetadataDto {
  @ApiProperty({ example: 'photo.jpg', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  declare readonly originalFilename: string;

  @ApiProperty({ example: ImageContentType.JPEG, enum: ImageContentType })
  @IsEnum(ImageContentType)
  declare readonly contentType: ImageContentType;

  @ApiProperty({ example: 1_048_576, minimum: MIN_IMAGE_SIZE_BYTES, maximum: MAX_IMAGE_SIZE_BYTES })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_IMAGE_SIZE_BYTES)
  @Max(MAX_IMAGE_SIZE_BYTES)
  declare readonly size: number;
}

export class CreateImageUploadsDto {
  @ApiProperty({
    type: () => [ImageUploadMetadataDto],
    minItems: MIN_IMAGES_PER_UPLOAD_REQUEST,
    maxItems: MAX_IMAGES_PER_UPLOAD_REQUEST,
  })
  @IsArray()
  @ArrayMinSize(MIN_IMAGES_PER_UPLOAD_REQUEST)
  @ArrayMaxSize(MAX_IMAGES_PER_UPLOAD_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => ImageUploadMetadataDto)
  declare readonly images: ImageUploadMetadataDto[];
}
