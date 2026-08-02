import { ApiProperty } from '@nestjs/swagger';

export class ImageUploadSessionDto {
  @ApiProperty({ example: '83d26252-a350-4e39-a78e-0bdf54d2341d' })
  declare readonly id: string;
}

export class CreateImageUploadsResponseDto {
  @ApiProperty({ type: () => [ImageUploadSessionDto] })
  declare readonly uploads: ImageUploadSessionDto[];
}
