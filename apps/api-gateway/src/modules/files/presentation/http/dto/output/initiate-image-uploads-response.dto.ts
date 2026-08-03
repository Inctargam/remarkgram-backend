import { ApiProperty } from '@nestjs/swagger';

export class ImageUploadSessionDto {
  @ApiProperty({ example: '83d26252-a350-4e39-a78e-0bdf54d2341d' })
  declare readonly id: string;

  @ApiProperty({ example: '2b610f18-cb6c-4c4a-aed1-cf8f0bff3b55' })
  declare readonly clientFileId: string;

  @ApiProperty({ example: 'https://storage.yandexcloud.net/images-bucket' })
  declare readonly url: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      key: 'user/42/images/83d26252-a350-4e39-a78e-0bdf54d2341d',
      Policy: 'base64-encoded-policy',
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    },
  })
  declare readonly fields: Record<string, string>;
}

export class InitiateImageUploadsResponseDto {
  @ApiProperty({ type: () => [ImageUploadSessionDto] })
  declare readonly sessions: ImageUploadSessionDto[];
}
