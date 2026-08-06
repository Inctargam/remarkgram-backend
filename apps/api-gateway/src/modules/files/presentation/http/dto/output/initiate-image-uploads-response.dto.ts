import { ApiProperty } from '@nestjs/swagger';

export class ImageUploadSessionDto {
  @ApiProperty({
    description: 'Server-generated upload ID used for confirmation and later as the post image ID.',
    example: '83d26252-a350-4e39-a78e-0bdf54d2341d',
    format: 'uuid',
  })
  declare readonly id: string;

  @ApiProperty({
    description: 'The client correlation ID from the matching request item.',
    example: '2b610f18-cb6c-4c4a-aed1-cf8f0bff3b55',
    format: 'uuid',
  })
  declare readonly clientFileId: string;

  @ApiProperty({
    description: 'Yandex Object Storage URL to which the multipart/form-data POST must be sent.',
    example: 'https://storage.yandexcloud.net/images-bucket',
  })
  declare readonly url: string;

  @ApiProperty({
    description:
      'Opaque signed form fields. Append every entry unchanged to FormData, then append the file field last.',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      key: 'user/42/images/83d26252-a350-4e39-a78e-0bdf54d2341d',
      'Content-Type': 'image/jpeg',
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': 'access-key/20260806/ru-central1/s3/aws4_request',
      'X-Amz-Date': '20260806T120000Z',
      Policy: 'base64-encoded-policy',
      'X-Amz-Signature': 'hex-encoded-signature',
    },
  })
  declare readonly fields: Record<string, string>;
}

export class InitiateImageUploadsResponseDto {
  @ApiProperty({
    description: 'One presigned POST session for each requested image.',
    type: () => [ImageUploadSessionDto],
  })
  declare readonly sessions: ImageUploadSessionDto[];
}
